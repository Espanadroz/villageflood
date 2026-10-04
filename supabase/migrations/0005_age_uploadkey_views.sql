-- 0005_age_uploadkey_views.sql — final fix wave (Ruling 20).
--  C1  observation age: a delayed (outbox) report keeps its observation time; too-old status reports are rejected.
--  I2  reports_public no longer exposes GPS; storage paths use a per-device upload key, never the device id.
--  I3  reports_status_public: status rows only (no general notes), so notes cannot push status rows out of a fetch.
--  I4  committee may delete evidence objects.

-- 1. Columns -----------------------------------------------------------------------------------------
-- received_at = server time of insertion (rate limiting); created_at = observation time (status/feed).
alter table reports add column received_at timestamptz not null default now();
create index reports_device_received on reports (device_id, received_at desc);

-- Storage folder key, bound to the device on first media upload. Public (it appears in media paths),
-- so it must never be accepted as a credential and must be unique per device.
alter table devices add column upload_key uuid;
create unique index devices_upload_key_unique on devices (upload_key) where upload_key is not null;

-- 2. Views (GPS removed; status-only view) ------------------------------------------------------------
drop view reports_public;
create view reports_public as
  select r.id, r.kind, r.target_id, r.value, r.nickname, r.created_at, r.location_ok,
         r.media_path, r.media_type, r.note, r.by_committee, r.confirmed_by_committee,
         (select count(*) from confirmations c where c.report_id = r.id) as confirmations
  from reports r where not r.deleted and r.created_at > now() - interval '7 days';

-- 7 days covers the maximum committee TTL (168 h).
create view reports_status_public as
  select r.id, r.kind, r.target_id, r.value, r.nickname, r.created_at, r.location_ok,
         r.media_path, r.media_type, r.note, r.by_committee, r.confirmed_by_committee,
         (select count(*) from confirmations c where c.report_id = r.id) as confirmations
  from reports r
  where not r.deleted and r.kind in ('road', 'water_level', 'supply') and r.created_at > now() - interval '7 days';

revoke all on reports_public, reports_status_public from anon, authenticated;
grant select on reports_public, reports_status_public to anon, authenticated;

-- 3. TTL helper (settings.ttl_ms with defaults; invalid/non-positive values fall back) ----------------
create function report_ttl_ms(p_kind text) returns bigint language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_default bigint;
begin
  v_default := case p_kind when 'road' then 10800000 when 'water_level' then 7200000 when 'supply' then 43200000 else null end;
  if v_default is null then return null; end if;  -- general: no limit
  select value -> p_kind into v from settings where key = 'ttl_ms';
  if v is not null and jsonb_typeof(v) = 'number' and (v #>> '{}')::numeric > 0 then
    return (v #>> '{}')::numeric::bigint;
  end if;
  return v_default;
end $$;
revoke execute on function report_ttl_ms(text) from public, anon, authenticated;

-- 4. submit_report: + p_upload_key, + p_age_seconds (last) ------------------------------------------
drop function submit_report(uuid, text, text, text, text, double precision, double precision, text, text, text, uuid);

create function submit_report(
  p_device uuid, p_nickname text, p_kind text, p_target text, p_value text,
  p_lat double precision, p_lng double precision,
  p_media_path text default null, p_media_type text default null, p_note text default null,
  p_client_id uuid default null,
  p_upload_key uuid default null,
  p_age_seconds integer default 0
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare
  v_committee boolean := is_committee();
  v_geom geography; v_max double precision := 150; v_ok boolean; v_id uuid;
  v_lat double precision := p_lat; v_lng double precision := p_lng;
  v_age integer := least(greatest(coalesce(p_age_seconds, 0), 0), 86400);
  v_ttl bigint; v_bound uuid;
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
  -- rate limit on server receipt time (created_at may be backdated by the observation age)
  if (select count(*) from reports where device_id = p_device and received_at > now() - interval '10 minutes') >= 10 then
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

  -- a status observation older than its TTL would already be expired: refuse it rather than store it
  v_ttl := report_ttl_ms(p_kind);
  if v_ttl is not null and v_age::bigint * 1000 >= v_ttl then raise exception 'report_too_old'; end if;

  -- evidence: path must live in this device's upload-key folder (never the device id), be typed and uploaded
  if p_media_path is not null then
    if p_upload_key is null
       or p_upload_key = p_device
       or length(p_media_path) > 200
       or p_media_path !~ ('^' || p_upload_key::text || '/[A-Za-z0-9._-]+$')
       or p_media_type is null
       or p_media_type not in ('image/jpeg','image/webp','video/mp4','video/webm','video/quicktime')
       or not exists (select 1 from storage.objects o where o.bucket_id = 'evidence' and o.name = p_media_path)
    then raise exception 'invalid_media'; end if;
    select upload_key into v_bound from devices where id = p_device for update;
    if v_bound is null then
      begin
        update devices set upload_key = p_upload_key where id = p_device;
      exception when unique_violation then raise exception 'invalid_media';
      end;
    elsif v_bound <> p_upload_key then
      raise exception 'invalid_media';
    end if;
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

  insert into reports (kind, target_id, value, device_id, nickname, lat, lng, location_ok, media_path, media_type, note,
                       by_committee, client_id, created_at, received_at)
  values (p_kind, p_target, p_value, p_device, left(trim(p_nickname), 40), v_lat, v_lng, v_ok, p_media_path, p_media_type,
          left(p_note, 500), v_committee, p_client_id, now() - make_interval(secs => v_age), now())
  on conflict (device_id, client_id) where client_id is not null do nothing
  returning id into v_id;
  if v_id is null then  -- lost a concurrent replay race
    select id into v_id from reports where device_id = p_device and client_id = p_client_id;
  end if;
  return v_id;
end $$;

revoke execute on function submit_report(uuid, text, text, text, text, double precision, double precision, text, text, text, uuid, uuid, integer) from public;
grant execute on function submit_report(uuid, text, text, text, text, double precision, double precision, text, text, text, uuid, uuid, integer) to anon, authenticated;

-- 5. Storage: committee may read (needed by the delete API) and delete evidence objects ---------------
create policy "committee reads evidence objects" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.is_committee());
create policy "committee deletes evidence" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.is_committee());
grant execute on function public.is_committee() to authenticated;

notify pgrst, 'reload schema';
