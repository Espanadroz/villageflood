create or replace function is_committee() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from committee_members where user_id = auth.uid())
$$;
create or replace function server_time() returns timestamptz language sql stable as $$ select now() $$;

-- Mirrors src/core/evidence.ts requiresEvidence() — keep in sync.
create or replace function requires_evidence(p_kind text, p_value text) returns boolean language sql immutable as $$
  select case p_kind when 'road' then p_value <> 'impassable' when 'water_level' then true else false end
$$;

create or replace function submit_report(
  p_device uuid, p_nickname text, p_kind text, p_target text, p_value text,
  p_lat double precision, p_lng double precision,
  p_media_path text default null, p_media_type text default null, p_note text default null
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_committee boolean := is_committee();
  v_geom geography; v_max double precision := 150; v_ok boolean; v_id uuid;
begin
  if p_nickname is null or length(trim(p_nickname)) = 0 then raise exception 'nickname_required'; end if;

  insert into devices (id, nickname) values (p_device, left(trim(p_nickname), 40))
    on conflict (id) do update set nickname = excluded.nickname;
  if (select blocked from devices where id = p_device) then raise exception 'device_blocked'; end if;
  if (select count(*) from reports where device_id = p_device and created_at > now() - interval '10 minutes') >= 10 then
    raise exception 'rate_limited';
  end if;

  -- validate value per kind
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

  if requires_evidence(p_kind, p_value) and p_media_path is null then raise exception 'evidence_required'; end if;

  -- target geometry and distance limit (metres)
  if p_kind = 'road' then select geom into v_geom from segments where id = p_target; v_max := 150;
  elsif p_kind = 'water_level' then select geom into v_geom from water_marks where id = p_target; v_max := 100;
  elsif p_kind = 'supply' then select geom into v_geom from places where id = p_target; v_max := 150;
  end if;
  if p_kind <> 'general' and v_geom is null then raise exception 'unknown_target'; end if;

  v_ok := case
    when p_kind = 'general' then true
    when p_lat is null or p_lng is null then false
    else st_distance(v_geom, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) <= v_max
  end;

  insert into reports (kind, target_id, value, device_id, nickname, lat, lng, location_ok, media_path, media_type, note, by_committee)
  values (p_kind, p_target, p_value, p_device, left(trim(p_nickname), 40), p_lat, p_lng, v_ok, p_media_path, p_media_type, left(p_note, 500), v_committee)
  returning id into v_id;
  return v_id;
end $$;

create or replace function confirm_report(p_device uuid, p_report uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select device_id from reports where id = p_report) = p_device then return; end if; -- cannot confirm own report
  insert into devices (id, nickname) values (p_device, 'ผู้ใช้') on conflict (id) do nothing;
  insert into confirmations (report_id, device_id) values (p_report, p_device) on conflict do nothing;
end $$;

create or replace function moderate_report(p_report uuid, p_action text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_committee() then raise exception 'committee_only'; end if;
  if p_action = 'confirm' then update reports set confirmed_by_committee = true where id = p_report;
  elsif p_action = 'delete' then update reports set deleted = true where id = p_report;
  else raise exception 'invalid_value'; end if;
end $$;

grant execute on function submit_report, confirm_report, moderate_report, server_time, is_committee to anon, authenticated;

-- RLS: reads public on reference data; reports only via view/RPC; committee manages content
alter table segments enable row level security;       alter table water_marks enable row level security;
alter table places enable row level security;         alter table destinations enable row level security;
alter table routes enable row level security;         alter table settings enable row level security;
alter table devices enable row level security;        alter table reports enable row level security;
alter table confirmations enable row level security;  alter table agency_readings enable row level security;
alter table agency_warnings enable row level security; alter table incidents enable row level security;
alter table committee_members enable row level security;

do $$ declare t text; begin
  foreach t in array array['segments','water_marks','places','destinations','routes','settings','agency_readings','agency_warnings','incidents'] loop
    execute format('create policy "public read" on %I for select to anon, authenticated using (true)', t);
  end loop;
  foreach t in array array['segments','water_marks','places','destinations','routes','settings'] loop
    execute format('create policy "committee write" on %I for all to authenticated using (is_committee()) with check (is_committee())', t);
  end loop;
end $$;

create policy "committee reads reports" on reports for select to authenticated using (is_committee());
create policy "committee manages devices" on devices for all to authenticated using (is_committee()) with check (is_committee());
create policy "self membership" on committee_members for select to authenticated using (user_id = auth.uid());

grant select on reports_public, agency_latest, agency_recent to anon, authenticated;
