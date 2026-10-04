# Village Flood Portal

Community flood-information portal for the village near เคหะร่มเกล้า / คลองสองต้นนุ่น (Lat Krabang, Bangkok).

- Spec: `docs/superpowers/specs/2026-10-04-village-portal-phase1-design.md`
- Plan: `docs/superpowers/plans/2026-10-04-village-portal-phase1.md`
- Spike results: `docs/spikes/2026-10-spike-results.md`
- Acceptance checklist (real phones): `docs/spikes/2026-10-phase1-acceptance.md`
- Production: NOT DEPLOYED YET (fill in after the deployment checklist below)

## Develop
```bash
cp .env.example .env     # fill from `supabase start` output
supabase start && supabase db reset
npm install && npm run dev
npm test                 # unit tests
npm run test:db          # database integration tests (needs local Supabase)
npm run poll             # fetch agency data once
npm run build            # type-check + production build (also generates the service worker)
```
Unit tests (`npm test`) need no `.env` (dummy Supabase values are set in `vitest.config.ts`); a deploy without the `VITE_SUPABASE_*` env vars shows a Thai configuration-error screen instead of a blank page.

## Safety rules (do not weaken)
Expiry → "ไม่ทราบ"; conflicts show the worse status; passable claims and water levels need fresh photo/video evidence; stale agency data is never shown as current; every datum shows its age. These live in `src/core` (unit-tested) and the `submit_report` RPC (integration-tested).

- A report keeps its observation time even when it is delivered late from the offline queue: the phone sends the report's age (`p_age_seconds`), the server stores `created_at = now() - age` and rejects road / water-level / supply reports older than their TTL (`report_too_old`). Rate limiting uses `received_at`.
- Queued and failed reports are shown app-wide (banner above every page) with retry / remove; nothing is dropped silently.
- Evidence files live under a random per-device upload key (`<upload_key>/<report>.jpg`), never under the device id (the device id is the only credential for `submit_report` / `confirm_report`). `reports_public` does not expose GPS coordinates.

## PWA
Installable (manifest + icons in `public/`, regenerate PNGs with `node scripts/make-icons.mjs`). The service worker (vite-plugin-pwa, `generateSW`, `autoUpdate`) precaches the app shell only, including the lazy map chunk. It has NO runtime caching: Supabase REST/auth/storage and map tiles always go to the network. The app keeps its own timestamped snapshot, so old data can never look current. Do not add `runtimeCaching` for data.

## Privacy notice
`/privacy` (`src/ui/pages/PrivacyPage.tsx`) is a DRAFT. It must be reviewed by someone knowledgeable about the Thai PDPA before the village-wide launch.

## Operations
- Poller runs every 10 minutes and deletes media older than 30 days: files of old reports, and any other object in the `evidence` bucket older than 30 days (orphan uploads). Exit code: `1` = at least one agency source failed, `2` = only media cleanup failed, `0` = all ok. Alert on any non-zero code.
- Committee access: invite the person first (Supabase dashboard → Authentication → Users → **Invite user**), then add them to `committee_members` (deployment step 7). The login form never creates accounts (`shouldCreateUser: false`).
- Committee "ลบ" (delete) soft-deletes the report and removes its evidence file; an error is shown if the file could not be removed.

## Deployment checklist for a human
NOT done by the automated build; each step needs a person (costs, accounts, secrets).

> **WARNING: never deploy a local build.** `npm run build`, `dist/` and `vercel deploy --prebuilt` bake your local `.env` VITE_* values (localhost Supabase URL and anon key) into the bundle. Deploy from Git / `vercel --prod` so Vercel builds with its own env vars set in the Vercel dashboard.

1. Create the production Supabase project (Singapore region). Creating a project can cost money: confirm the plan/price first. Record the project ref.
2. Apply the schema only (never the demo seed): `supabase link --project-ref <ref>` then `supabase db push` (migrations 0001-0005). 0005 changes `submit_report` (13 arguments), drops lat/lng from `reports_public`, adds `reports_status_public` and committee storage delete policies; deploy the app built from the same commit.
   Then in the dashboard: Project Settings → API (Data API) → **Max rows** must be at least **5000** (the app fetches up to 5000 status rows; local `supabase/config.toml` sets `max_rows = 5000`). If it is lower the app shows "ข้อมูลรายงานมีมากเกินไป สถานะอาจไม่ครบ" because it detects the cap.
3. Create the Vercel project (connect the Git repo) and set production env vars in the Vercel dashboard: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CAPTURE_MODE` (value from the Task 1 spike results). Never put the service-role key in browser-exposed variables.
4. First deploy (push to the production branch, or `vercel --prod` from a Git-connected project). Record the production URL at the top of this file.
5. Only now that the domain exists: Supabase Authentication → URL Configuration: set the Site URL to the production domain and add `https://<production-domain>/admin` as a redirect URL.
6. Configure custom SMTP in Supabase Auth so magic-link emails to committee members are reliably delivered.
7. Add committee members. The login form does NOT create accounts, so first invite each member: Supabase dashboard → Authentication → Users → **Invite user** (their email). Then, in the Supabase SQL editor:
   ```sql
   insert into committee_members (user_id)
   select id from auth.users where email in ('member1@example.com', 'member2@example.com')
   on conflict do nothing;
   ```
8. Load real data (segments, routes, wall marks, places, destinations) via the admin editor, or with the import script against production using the committee's approved files (review `data/places.candidates.json` first):
   ```bash
   npx tsx --env-file=.env scripts/import-geo.mjs segments data/segments.json --i-know-this-is-production
   npx tsx --env-file=.env scripts/import-geo.mjs places data/places.json --i-know-this-is-production
   ```
   (`.env` must then hold the PRODUCTION `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`; restore local values afterwards.)
9. Poller hosting: decide from the Task 1 spike results (`POLLER_HOST`): is a Thai IP needed? Did the BMA request return 403 from the chosen host? On that host set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the production project, then schedule `npm run poll` every 10 minutes (cron).
10. Have the privacy text reviewed (PDPA), fill in `docs/spikes/2026-10-phase1-acceptance.md` on real phones and run the committee drill (plan Task 16 Steps 6-7) before announcing to the whole group.

## Known gaps (not fixed in Phase 1; decide before a wider launch)
- **Upload quota / edge rate limiting:** anyone can upload files (up to 25 MB each) into any uuid-shaped folder of the `evidence` bucket. Unused uploads are deleted after 30 days, but there is no per-device upload quota and no edge (IP) rate limit, so storage can be filled by abuse in the meantime.
- **Committee "ยืนยัน" (confirm) semantics:** confirming a report makes it count even without a location match, and a confirmed report keeps counting until it expires; there is no "confirmed by whom / when" record shown to residents and no way to un-confirm except deleting.
- **Route-map disclosure:** opening a route in Google Maps sends the origin/destination/waypoints to Google; this is not yet mentioned on `/privacy`.
- **Signed-in admin flows are unverified in a real browser** (magic-link login, moderation incl. evidence deletion, settings, content editor); they are covered by unit and database tests only.
- **Phone tests pending:** the acceptance checklist (`docs/spikes/2026-10-phase1-acceptance.md`) on real Android/iOS phones (camera capture, offline queue, PWA install, the outbox banner) has not been run.
