-- supabase/seed.sql — DEMO data for local development. Replace with real data in Task 14.
insert into segments (id, name, geojson) values
  ('seg-demo-1', 'ซอยตัวอย่าง 1', '{"type":"LineString","coordinates":[[100.7380,13.7765],[100.7400,13.7775]]}'),
  ('seg-demo-2', 'ถนนตัวอย่าง 2', '{"type":"LineString","coordinates":[[100.7400,13.7775],[100.7440,13.7790]]}');
insert into water_marks (id, name, geojson, levels) values
  ('mark-demo-wall', 'กำแพงริมคลอง (ตัวอย่าง)', '{"type":"Point","coordinates":[100.7385,13.7768]}',
   '[{"level":1,"label":"ขีดที่ 1"},{"level":2,"label":"ขีดที่ 2"},{"level":3,"label":"ขีดที่ 3"}]');
insert into places (id, name, category, geojson) values
  ('place-demo-1', 'ร้านสะดวกซื้อ (ตัวอย่าง)', 'store', '{"type":"Point","coordinates":[100.7420,13.7780]}');
insert into destinations (id, name, kind, lat, lng) values
  ('dest-demo-airport-link', 'สถานีลาดกระบัง (ตัวอย่าง)', 'station', 13.7273, 100.7517);
insert into routes (id, name, destination_id, segment_ids, waypoints, distance_m) values
  ('route-demo-1', 'เส้นตัวอย่าง', 'dest-demo-airport-link', array['seg-demo-1','seg-demo-2'], '[]', 6500);
