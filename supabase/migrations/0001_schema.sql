create extension if not exists postgis with schema extensions;

create or replace function set_geom() returns trigger language plpgsql as $$
begin
  new.geom := extensions.st_setsrid(extensions.st_geomfromgeojson(new.geojson::text), 4326)::extensions.geography;
  return new;
end $$;

create table segments (
  id text primary key, name text not null, geojson jsonb not null, geom extensions.geography, sort int not null default 0
);
create table water_marks (
  id text primary key, name text not null, geojson jsonb not null, geom extensions.geography,
  levels jsonb not null  -- [{"level":1,"label":"ขีดที่ 1"}, ...]
);
create table places (
  id text primary key, name text not null,
  category text not null check (category in ('food','market','store','fuel','hospital')),
  geojson jsonb not null, geom extensions.geography
);
create trigger segments_geom before insert or update of geojson on segments for each row execute function set_geom();
create trigger marks_geom before insert or update of geojson on water_marks for each row execute function set_geom();
create trigger places_geom before insert or update of geojson on places for each row execute function set_geom();

create table destinations (
  id text primary key, name text not null, kind text not null, lat double precision not null, lng double precision not null
);
create table routes (
  id text primary key, name text not null, destination_id text not null references destinations(id),
  segment_ids text[] not null, waypoints jsonb not null default '[]', distance_m int not null check (distance_m > 0)
);

create table devices (
  id uuid primary key, nickname text not null, blocked boolean not null default false, created_at timestamptz not null default now()
);
create table reports (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('road','water_level','supply','general')),
  target_id text not null, value text not null,
  device_id uuid not null references devices(id), nickname text not null,
  created_at timestamptz not null default now(),
  lat double precision, lng double precision, location_ok boolean not null,
  media_path text, media_type text, note text,
  by_committee boolean not null default false,
  confirmed_by_committee boolean not null default false,
  deleted boolean not null default false
);
create index reports_recent on reports (created_at desc);
create index reports_target on reports (kind, target_id, created_at desc);
create table confirmations (
  report_id uuid references reports(id) on delete cascade, device_id uuid references devices(id),
  created_at timestamptz not null default now(), primary key (report_id, device_id)
);

create table settings (key text primary key, value jsonb not null);
insert into settings (key, value) values
  ('ttl_ms', '{"road":10800000,"water_level":7200000,"supply":43200000}'),
  ('agency_max_age_ms', '3600000'),
  ('gauge_thresholds', '{}');   -- e.g. {"WL.STN.02":{"watch":0.5,"danger":0.8}} set by committee

create table agency_readings (
  source text not null, station_id text not null, station_name text not null,
  lat double precision, lng double precision,
  metric text not null, value double precision not null, unit text not null,
  observed_at timestamptz not null, fetched_at timestamptz not null default now(),
  primary key (source, station_id, metric, observed_at)
);
create table agency_warnings (
  id text primary key, source text not null, title text not null, body text not null, url text,
  issued_at timestamptz not null, mentions_bangkok boolean not null default false, fetched_at timestamptz not null default now()
);
create table incidents (
  id text primary key, source text not null, title text not null,
  lat double precision not null, lng double precision not null, severity int,
  start_at timestamptz not null, stop_at timestamptz not null, fetched_at timestamptz not null default now()
);
create table committee_members (user_id uuid primary key references auth.users(id) on delete cascade);

create view agency_latest as
  select distinct on (source, station_id, metric) * from agency_readings order by source, station_id, metric, observed_at desc;
create view agency_recent as
  select * from agency_readings where observed_at > now() - interval '6 hours';
create view reports_public as
  select r.id, r.kind, r.target_id, r.value, r.nickname, r.created_at, r.lat, r.lng, r.location_ok,
         r.media_path, r.media_type, r.note, r.by_committee, r.confirmed_by_committee,
         (select count(*) from confirmations c where c.report_id = r.id) as confirmations
  from reports r where not r.deleted and r.created_at > now() - interval '7 days';

-- Storage bucket for evidence
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', true, 26214400, array['image/jpeg','image/webp','video/mp4','video/webm','video/quicktime'])
on conflict (id) do nothing;
create policy "anyone can upload evidence" on storage.objects for insert to anon, authenticated with check (bucket_id = 'evidence');
