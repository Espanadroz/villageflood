-- 0004_idempotent_reports.sql — submit_report becomes idempotent via client_id.
alter table reports add column client_id uuid;
create unique index reports_client_unique on reports (device_id, client_id) where client_id is not null;

drop function submit_report(uuid, text, text, text, text, double precision, double precision, text, text, text);

create function submit_report(
  p_device uuid, p_nickname text, p_kind text, p_target text, p_value text,
  p_lat double precision, p_lng double precision,
  p_media_path text default null, p_media_type text default null, p_note text default null,
  p_client_id uuid default null
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

  -- idempotent replay: same (device, client_id) returns the original report, consuming no rate-limit slot
  if p_client_id is not null then
    select id into v_id from reports where device_id = p_device and client_id = p_client_id;
    if found then return v_id; end if;
  end if;
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

  insert into reports (kind, target_id, value, device_id, nickname, lat, lng, location_ok, media_path, media_type, note, by_committee, client_id)
  values (p_kind, p_target, p_value, p_device, left(trim(p_nickname), 40), v_lat, v_lng, v_ok, p_media_path, p_media_type, left(p_note, 500), v_committee, p_client_id)
  on conflict (device_id, client_id) where client_id is not null do nothing
  returning id into v_id;
  if v_id is null then  -- lost a concurrent replay race
    select id into v_id from reports where device_id = p_device and client_id = p_client_id;
  end if;
  return v_id;
end $$;

revoke execute on function submit_report(uuid, text, text, text, text, double precision, double precision, text, text, text, uuid) from public;
grant execute on function submit_report(uuid, text, text, text, text, double precision, double precision, text, text, text, uuid) to anon, authenticated;
