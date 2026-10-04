-- 0003_hardening.sql — lock down grants (views were writable by anon), verify uploaded evidence, bound confirmations.

-- 1. Grants: nothing by default, then explicit allow-list. service_role is untouched.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

grant select on segments, water_marks, places, destinations, routes, settings,
  agency_readings, agency_warnings, incidents, reports_public, agency_latest, agency_recent
  to anon, authenticated;
-- committee (authenticated + is_committee() via RLS)
grant select, insert, update, delete on segments, water_marks, places, destinations, routes, settings, devices to authenticated;
grant select on reports, committee_members to authenticated;

revoke execute on function set_geom() from public, anon, authenticated;
revoke execute on function requires_evidence(text, text) from public, anon, authenticated;

-- 2. Storage: uploads only into a device-uuid folder of the evidence bucket.
drop policy if exists "anyone can upload evidence" on storage.objects;
create policy "anyone can upload evidence" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$');

-- 3. submit_report: verified evidence, coordinate range check, blocked devices cannot rename.
create or replace function submit_report(
  p_device uuid, p_nickname text, p_kind text, p_target text, p_value text,
  p_lat double precision, p_lng double precision,
  p_media_path text default null, p_media_type text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_committee boolean := is_committee();
  v_geom geography; v_max double precision := 150; v_ok boolean; v_id uuid;
  v_lat double precision := p_lat; v_lng double precision := p_lng;
begin
  if p_nickname is null or length(trim(p_nickname)) = 0 then raise exception 'nickname_required'; end if;

  insert into devices (id, nickname) values (p_device, left(trim(p_nickname), 40)) on conflict (id) do nothing;
  if (select blocked from devices where id = p_device) then raise exception 'device_blocked'; end if;
  update devices set nickname = left(trim(p_nickname), 40) where id = p_device;
  if (select count(*) from reports where device_id = p_device and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate_limited';
  end if;

  if p_kind = 'road' and p_value not in ('dry','small_car','high_clearance','impassable') then raise exception 'invalid_value'; end if;
  if p_kind = 'supply' and p_value not in ('open','closed','out_of_stock','unreachable') then raise exception 'invalid_value'; end if;
  if p_kind = 'water_level' and not exists (
    select 1 from water_marks m, jsonb_array_elements(m.levels) l where m.id = p_target and (l->>'level') = p_value
  ) then raise exception 'invalid_value'; end if;
  if p_kind = 'general' then
    if p_value <> 'note' or p_note is null or length(trim(p_note)) = 0 then raise exception 'invalid_value'; end if;
    if p_target not in ('village','wall','drainage') then raise exception 'unknown_target'; end if;
    if p_target in ('wall','drainage') and not v_committee then raise exception 'committee_only'; end if;
  end if;
  if p_kind not in ('road','water_level','supply','general') then raise exception 'invalid_value'; end if;

  -- evidence: a provided path must be this device's own, well-formed, typed, and actually uploaded
  if p_media_path is not null then
    if length(p_media_path) > 200
       or p_media_path !~ ('^' || p_device::text || '/[A-Za-z0-9._-]+$')
       or p_media_type is null
       or p_media_type not in ('image/jpeg','image/webp','video/mp4','video/webm','video/quicktime')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'evidence' and o.name = p_media_path)
    then raise exception 'invalid_media'; end if;
  end if;
  if requires_evidence(p_kind, p_value) and p_media_path is null then raise exception 'evidence_required'; end if;

  if v_lat is not null and v_lng is not null and (v_lat not between -90 and 90 or v_lng not between -180 and 180) then
    v_lat := null; v_lng := null;
  end if;
  if v_lat is null or v_lng is null then v_lat := null; v_lng := null; end if;

  if p_kind = 'road' then select geom into v_geom from segments where id = p_target; v_max := 150;
  elsif p_kind = 'water_level' then select geom into v_geom from water_marks where id = p_target; v_max := 100;
  elsif p_kind = 'supply' then select geom into v_geom from places where id = p_target; v_max := 150;
  end if;
  if p_kind <> 'general' and v_geom is null then raise exception 'unknown_target'; end if;

  v_ok := case
    when p_kind = 'general' then true
    when v_lat is null then false
    else st_distance(v_geom, st_setsrid(st_makepoint(v_lng, v_lat), 4326)::geography) <= v_max
  end;

  insert into reports (kind, target_id, value, device_id, nickname, lat, lng, location_ok, media_path, media_type, note, by_committee)
  values (p_kind, p_target, p_value, p_device, left(trim(p_nickname), 40), v_lat, v_lng, v_ok, p_media_path, p_media_type, left(p_note, 500), v_committee)
  returning id into v_id;
  return v_id;
end $$;

-- 4. confirm_report: only known reporters, bounded.
create or replace function confirm_report(p_device uuid, p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  select device_id into v_owner from reports where id = p_report and not deleted;
  if not found then raise exception 'unknown_report'; end if;
  if not exists (select 1 from devices where id = p_device) then raise exception 'not_a_reporter'; end if;
  if (select blocked from devices where id = p_device) then raise exception 'device_blocked'; end if;
  if not exists (select 1 from reports where device_id = p_device) then raise exception 'not_a_reporter'; end if;
  if v_owner = p_device then return; end if;
  if (select count(*) from confirmations where device_id = p_device and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'rate_limited';
  end if;
  insert into confirmations (report_id, device_id) values (p_report, p_device) on conflict do nothing;
end $$;
