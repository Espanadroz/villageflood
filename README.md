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

## Safety rules (do not weaken)
Expiry → "ไม่ทราบ"; conflicts show the worse status; passable claims and water levels need fresh photo/video evidence; stale agency data is never shown as current; every datum shows its age. These live in `src/core` (unit-tested) and the `submit_report` RPC (integration-tested).

## PWA
Installable (manifest + icons in `public/`, regenerate PNGs with `node scripts/make-icons.mjs`). The service worker (vite-plugin-pwa, `generateSW`, `autoUpdate`) precaches the app shell only, including the lazy map chunk. It has NO runtime caching: Supabase REST/auth/storage and map tiles always go to the network. The app keeps its own timestamped snapshot, so old data can never look current. Do not add `runtimeCaching` for data.

## Privacy notice
`/privacy` (`src/ui/pages/PrivacyPage.tsx`) is a DRAFT. It must be reviewed by someone knowledgeable about the Thai PDPA before the village-wide launch.

## Operations
- Poller runs every 10 minutes and deletes media older than 30 days.
- Committee access: add users to `committee_members` (see the SQL in the admin section of the plan, Task 15 Step 3).

## Deployment checklist for a human
NOT done by the automated build; each step below needs a person (costs, accounts, secrets).

1. Create the production Supabase project (Singapore region). Creating a project can cost money: confirm the plan/price first. Record the project ref.
2. Apply the schema only (never the demo seed): `supabase link --project-ref <ref>` then `supabase db push` (migrations 0001-0004).
3. Authentication → URL Configuration: set the Site URL to the production domain and add the production `/admin` URL as a redirect URL.
4. Configure custom SMTP in Supabase Auth so magic-link emails to committee members are reliably delivered.
5. Add committee members to `committee_members` with the SQL from plan Task 15 Step 3 (their login emails).
6. Vercel: `vercel link`, then set env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CAPTURE_MODE` (value from the Task 1 spike) for production. Never put the service-role key in browser-exposed variables. Deploy with `vercel --prod` and record the URL above.
7. Poller hosting: decide from the Task 1 spike results (`POLLER_HOST`): is a Thai IP needed? Did the BMA request return 403 from the chosen host? On the host set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the production project and schedule the poll every 10 minutes (cron).
8. Load real data: segments, routes, wall marks and places via the admin editor, or `node --env-file=.env scripts/import-geo.mjs <table> <file> --i-know-this-is-production` with the committee's approved files (`data/places.candidates.json` reviewed first).
9. Have the privacy text reviewed (PDPA), then fill in the acceptance checklist on real phones and run the committee drill (plan Task 16 Steps 6-7) before announcing to the whole group.
