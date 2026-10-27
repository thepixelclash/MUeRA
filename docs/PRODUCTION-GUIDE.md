# MUeRA production guide

## Changed files (this pass)
- src/lib/schedule-commands.ts (+test), src/lib/db.pglite.test.ts (real-Postgres schema/RLS tests), src/test/setup.ts (window guard), store.ts addSlot/updateSlot/deleteSlot; devDependency @electric-sql/pglite
- src/lib/ai-guard.ts (new): verifies Supabase token server-side, per-user rate limit
- src/lib/ai-guard.test.ts (new): 7 tests
- src/lib/ai.functions.ts: askAI now requires a valid session
- src/lib/ai.server.ts: provider set by env (AI_BASE_URL/AI_API_KEY/AI_MODEL); honest "not configured" error (503)
- src/lib/client.ts: sends the session token; friendly 401/429 messages
- src/lib/cloud-sync.ts (+test), src/lib/task-commands.ts (+test), src/lib/ai-errors.test.ts (new); src/routes/assistant.tsx now uses task-commands; Task gets an optional `priority`
- supabase/migrations/0003_relational_tables.sql, supabase/tests/rls_relational.sql (new)
- src/lib/store.ts: now syncs to the relational tables; cloud save/load errors shown to the user with Retry; never overwrites cloud data after a failed load
- supabase/migrations/0001, 0002 (new), supabase/schema.sql (hardened), supabase/tests/rls_two_users.sql (new)
- .env.example, docs/ (new); package.json/lock: @testing-library/dom dev dependency
- Lint auto-format (prettier) touched many files with whitespace only. No design/UI changes.

## Setup
1. `npm install --legacy-peer-deps` (plain install fails on a peer-dependency conflict)
2. Create Supabase project; run supabase/migrations/0001 then 0002 in the SQL editor.
3. Enable Google provider in Supabase; add site URLs (see SETUP-AUTH-DATABASE.md).
4. Copy .env.example to .env.local and fill in values. Set the same as host secrets/variables.
5. `npm run dev`, or `npm run build`.

## Data model
Relational tables, one per kind of user data, each with `user_id` FK to auth.users (cascade), constraints, timestamps, indexes, RLS with SELECT/INSERT/UPDATE/DELETE policies: `subjects`, `tasks` (incl. priority, duration), `timetable_slots`, `attendance_records`, `documents` (metadata + extracted text + AI cache), `chat_messages` (AI conversation history), `user_settings` (preferences, saved plan note).
Saved study plans are stored as study-type rows in `tasks` plus `user_settings.plan_note`.
The old single-row `user_data` table is kept (never dropped). On first sign-in with empty new tables, the app copies that JSON (or local browser data) into the tables. Existing browser data is not deleted.
Safe migration: run `supabase/migrations/0001`, `0002`, `0003` in order (or `supabase/schema.sql`, which is all three, idempotent). Take a Supabase backup first if the project already holds data.

## Hosting
The app is TanStack Start with server-side rendering and server functions. `npm run build` outputs a Cloudflare Workers bundle (.output). 
- Recommended: Cloudflare Workers/Pages (free tier exists). Deploy `.output` with wrangler; set env vars as secrets.
- InfinityFree (chosen by the owner): works through a static build plus a PHP AI endpoint (see the InfinityFree route below). Live at https://meora.free.nf (v7 deployed; the bundle in this ZIP is newer and not yet uploaded).

## Assistant commands (deterministic, no AI call; src/lib/task-commands.ts)
add task (date/time/priority/duration), edit/move/reschedule, set priority/duration/deadline, rename, complete, delete (asks "yes" first), create study session. Ambiguous task or missing/invalid/past date gets a question and nothing is changed. Changes go through the store, which syncs to Supabase.
Timetable (src/lib/schedule-commands.ts): add a weekly class (“add class Chemistry on friday 10am-11am in Lab 3”), move/reschedule (“move physics class to monday 2pm”, keeps length), remove (asks “yes” first). It refuses overlaps, bad times and classes that do not exist, and asks which one when several match. It edits the weekly slot (all weeks), not one date.
Not supported by command: one-off single-date timetable exceptions, and AI answers (summaries, study-plan advice) are AI calls that need a configured provider.

## Tested vs pending
Tested locally (run, passing): `npx tsc --noEmit` clean; `npx eslint .` 0 errors / 9 pre-existing warnings; `npm test` 74 tests in 10 files: AI guard (401/429/503), AI not-configured errors, task CRUD commands (add/edit/complete/delete-confirm/ambiguity/invalid dates/study sessions), relational mapping and sync planning (round trip, only changed rows, deletes, persistence across sessions), existing rules/timetable/routing tests; `npm run build` succeeds.
Real Postgres engine (PGlite, a WebAssembly build of PostgreSQL), src/lib/db.pglite.test.ts: runs supabase/schema.sql twice (idempotent), checks RLS enabled and 4 policies on every table, own-row CRUD, user B sees nothing of A, B cannot update/delete/forge A's rows, signed-out role gets nothing, constraints reject bad data, updated_at trigger, cascade delete only affects the deleted user, legacy user_data kept. Supabase's auth schema (auth.uid(), auth.users, roles) is stubbed, so this proves the SQL policies, not Supabase itself. The two supabase/tests/*.sql scripts also run clean on it. A fake-DB test in cloud-sync.test.ts covers client sync logic only.
PENDING external configuration, not run: Google OAuth sign-in/out and session expiry; real two-account isolation on an actual Supabase project (run supabase/tests/*.sql there, then sign in with two real Google accounts); live AI answers; end-to-end cloud sync against Supabase; CORS and HTTPS on the deployed host; page refresh on each route when deployed (route matching for / is tested; auth-gated pages need a live session).
Not implemented: no separate API host; CORS is same-origin only because the AI endpoint is on the same host; no hosted deployment.

## Design preservation evidence
After formatting both trees with the same prettier config, the original ZIP and this tree have zero differences in src/components, src/hooks, src/router and public. Differences in src/routes: assistant.tsx only (logic, no className/JSX changes). styles.css differs by whitespace only. Screenshot of the app in an unconfigured local build: docs/evidence/signin-config-gate-local.png. No side-by-side screenshots of the signed-in pages exist, because signing in needs a Supabase project.
Note: the setup gate screen text mentions supabase/schema.sql, which is now the full schema.

## Deployment verification checklist
- [ ] Sign in with Google, reload, still signed in
- [ ] Sign out, sign in: data still there
- [ ] Two accounts see only their own data (run RLS test)
- [ ] AI call while signed out is refused (401)
- [ ] AI call signed in works; rapid repeated calls get 429
- [ ] No keys in browser bundle (search dist for AI_API_KEY value)
- [ ] Direct URL refresh works on /assistant, /planner, /learn, /scan

## InfinityFree route (static frontend + PHP AI endpoint)

InfinityFree runs PHP/MySQL and static files only (no Node). The default build (Cloudflare Workers/SSR) cannot run there, so this repo has a second build:

1. `npm run build:static` (sets MUERA_STATIC=1 and VITE_AI_ENDPOINT=/api/ai.php, set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first). Output: `infinityfree-package/htdocs/` (index.html SPA shell, .htaccess rewrite, api/).
2. Copy `api/config.example.php` to `api/config.php` on the server only, and fill the AI base URL, key, model and Supabase URL/anon key. Never commit config.php. The PHP file stays "not configured" (503) until a provider key is set.
3. Upload htdocs/* to the site's htdocs via the InfinityFree file manager or FTP.
4. Supabase: run supabase/schema.sql in the SQL editor, enable Google provider, add the site URL and redirect URL.

Tested: PHP endpoint 13/13 on PHP 8.3 WASM against mock Supabase and AI servers (`npm run test:php`); static build produces _shell.html. Pending (needs live accounts): deploy, SPA refresh on real host, Google OAuth, two-account RLS on live Supabase, live AI, and whether InfinityFree bot protection blocks browser fetch calls to /api/ai.php.


## Live state, AI, PWA and known gaps (v8 bundle)
- AI: api/ai.php calls Groq (model openai/gpt-oss-120b, free plan, Zero Data Retention on). Key lives only in api/config.php on the host. Limits 10/min and 150/day per user. InfinityFree strips the Authorization header, so the app also sends X-Session-Token; the PHP accepts both.
- .htaccess: SPA rewrite, MIME types for .mjs/.webmanifest, no-cache for sw.js and manifest.json.
- PDF reading: the host served pdf.worker .mjs as text/plain and broke PDF reading live. The static build now renames it to .js (scripts/build-static.sh). Needs upload, then retest in Learn and Scan.
- PWA: public/manifest.json, public/sw.js, icons from the supplied MUeRA wordmark (192, 512, maskable, apple-touch, favicon.ico from the M crop). The service worker caches only same-origin /assets/ and /icons/; never /api/, tokens or cross-origin. Settings has an Install MUeRA section. Verified locally in headless Chrome: no installability errors, manifest parsed, service worker activated. Not verified on a real phone/PC or live host.
- Dates: Scanner flags a draft for review when the source's weekday word contradicts the resolved date, or on "next <weekday>".
- OCR: tesseract.js downloads its engine and English language data from cdn.jsdelivr.net at first use. That request carries no document content; images are processed in the browser.
- Not tested: image OCR, timetable save/replace, second-account isolation via the real app, mobile layout, real device install, OAuth inside installed PWA, real PDF after fix.
- Deployment checklist: set VITE_* env, npm run build:static, upload htdocs/* (api/config.php stays on the host, not overwritten), clear browser cache once, retest.

## Per-user Google Drive uploads (code ready, OFF until configured)
- src/lib/drive.ts: Google Identity Services token model, scope drive.file only, in-memory short-lived token, files go to a "MUeRA uploads" folder in the user's own Drive; only the Drive file id is stored (documents.drive_file_id, migration 0004). Deleting a document removes only the MUeRA entry; the user is asked whether to also trash the Drive original (default: keep). Scanner uploads are also saved to Drive when enabled.
- Settings shows a "Google Drive" opt-in only when VITE_GOOGLE_CLIENT_ID is set at build time. Without it, behaviour is unchanged (PDFs are read in the browser; extracted text and AI results stay in Supabase).
- Drive does not remove database use: extracted text (up to 500k chars/doc) and cached AI answers stay in Supabase.
- Setup done (Oct 26): migration 0004 applied; Drive API was already enabled; drive.file added to the shared consent screen Data access; https://meora.free.nf added as Authorised JavaScript origin of the "MUeRA (Supabase)" client only. A future host needs its origin added the same way. Then: set VITE_GOOGLE_CLIENT_ID; rebuild; test with a synthetic PDF.
- Not tested live. The shared Google Cloud project also holds the SoundScope clients; the consent screen is shared.
## Home greeting
Home shows "Hey <first name>" from the Google profile name Supabase stores at sign-in (given_name, full_name or name); falls back to "Hey there". Never derived from the email address.

## Status as of v11 (source only, not yet deployed)
- Settings privacy copy corrected: data is saved to the user's private Supabase account; uploads read in the browser; optional Drive copy; AI sends only chosen text to Groq (ZDR). "Delete all my data" empties the app state, which the sync layer applies to the user's Supabase rows (code-derived, NOT exercised live); it never touches Drive files.
- Greeting title-cases all-caps names (ARYAN -> Aryan).
- Live-verified on v10: Drive consent (drive.file only, unverified-app screen observed in Testing mode), Learn upload to Drive + documents.drive_file_id, delete keeps Drive file by default.
- Remaining: Scanner Drive upload not exercised live; timetable slots have no source-file link; consent screen shows "free.nf" until Branding is set (shared project, needs owner decision); second-account isolation via app, token-expiry re-prompt, mobile/real-device install, image OCR, timetable save/replace untested.

## v12 (source only, not deployed)
- Drive reconnect: the Drive token is memory-only, so after reload/expiry the app shows a toast with a "Reconnect Drive" button (src/lib/drive-ui.ts saveFileToDrive); a real click is needed to open Google's popup, because activation is lost after async PDF reading. Learn patches documents.drive_file_id once the upload succeeds; Scanner keeps the id for the next save. Not yet observed live.
- Timetable source file link: timetable_slots.source_file_id (migration 0005, applied to the Supabase project, additive). Scanner timetable mode passes the Drive file id to saveTimetable; new slots carry sourceFileId and sync via cloud-sync.ts. If the file is only uploaded after the user saves, slots saved earlier have no link.
- Notices: saved tasks get "Source file: <Drive link>" in notes when the id is known at save time.
- Unit tests: 82/82 (round trip for both file ids).

### v12c: source-link race closed
Scanner saves ("Save to calendar", "Confirm timetable") are paused while the Drive upload runs. If Drive needs reconnecting or the upload fails, a visible message says so, a "Reconnect and retry Drive save" button is offered, and saving is still possible but explicitly without a Drive link. Not live-tested yet.

### v12d
Scanner "Reconnect and retry Drive save" now reconnects (new `reconnectAndSave`, shared with the toast; unit-tested with mocks). Scanner footer text now says the original file is copied to Drive immediately when Drive saving is on, and that tasks/timetable are saved only on confirm. The Groq text disclosure is explicit. Not live-tested until deployed.
