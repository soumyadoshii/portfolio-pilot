# HANDOFF — PortfolioPilot (cumulative record)

> **Reading guide:** this file is a dated, cumulative record. **Start with "Current state" below.** The sections after it (Phase 0, 1a, 1b, 2A) were accurate when written; items marked **Historical** or **Superseded** have since changed. The appendices at the end record Phase 1c, Phase 2B, the CS-1 to CS-9 cleanup and the documentation update. Statements about MySQL or browser behaviour say who verified them; nothing here claims more than was actually run.

## Current state (2026-10-11) — read this first

**Status:** the Manus-infrastructure cleanup (CS-1 to CS-9) is complete and recorded at the end of this file. The "gate open" status in the Phase 0 section further down is historical. The project is not a Git repository and nothing has been pushed.

### Current setup (local, any OS)

1. `pnpm install` (pnpm 10.18; developed and tested on Node.js 24.13, see "Open items").
2. Copy `.env.example` to `.env` and set `DATABASE_URL` to a MySQL 8 database that you control. Leave `MANUS_API_URL` and `MANUS_API_KEY` blank unless you are configuring the optional Coach AI.
3. On a new, empty database run `pnpm db:migrate`, which applies `drizzle/0000_*.sql` and `0001_*.sql`. Do not use `pnpm db:push`.
4. `pnpm dev`, then open http://localhost:3000. `pnpm dev` and `pnpm start` run through `scripts/with-node-env.mjs` (17 lines) so that `NODE_ENV` is set on Windows as well as on Linux and macOS. For a production run use `pnpm build`, then `pnpm start`.
5. Restart the server after editing `.env`: it is read only at startup (a server started before `.env` existed is the most likely cause of the registration 500 described in Phase 1c; that cause was inferred from timestamps and not confirmed from the server log).

Demo mode and all analytics work without a database; only registration, sign-in and saved account state need `DATABASE_URL`.

### Latest recorded validation

Windows, Node 24.13, pnpm 10.18. Every cleanup run used a `DATABASE_URL` pointing at an unreachable placeholder, so none of them touched a real database.

| Check | Result |
| --- | --- |
| `pnpm check` | exit 0 |
| `pnpm test` | exit 0, **115 of 115** in 8 files: onboarding 10, backtest 10, finance 21, app-security 7, safe-error 18, app-api.http 14, coach-ai 34, platform 1 |
| `pnpm build` | exit 0 |
| `pnpm install --frozen-lockfile` | exit 0 ("Lockfile is up to date"), run after the CS-9 dependency removal |

The `app-api.http` tests use an in-memory repository and the `coach-ai` tests use a stubbed provider. Neither exercises MySQL or a real AI provider.

### Owner-reported manual verification (not independently verified)

The project owner reports that, after the existing migrations were applied to a local MySQL database, registration, sign-in, reload persistence, sign-out and re-sign-in worked in Chrome on `http://localhost`, and that the Portfolio, Stress test, Backtest, All-weather, Coach and Reports pages rendered. This was a manual check; it is not covered by any automated test and was not performed by the assistant. **Not covered:** persistence across a server restart, Firefox, Edge and Safari, responsive and accessibility checks, goal create/edit/delete, CSV import, scenario edits, print and Markdown download, password change, session revocation, account deletion in the UI, and Coach or report AI against a real provider.

### What the cleanup removed

- The tRPC server (`context`, `trpc`, `systemRouter`, `routers`), the client tRPC/React Query bootstrap, and the Manus OAuth/SDK code (`sdk`, `oauth`, `manusTypes`).
- The public-config script (`/api/platform/config.js`) with its Vite plugin, and the earlier debug collector.
- Unreachable client files (dashboard layout, map, AI chat box, login dialog, template pages, auth hook, constants) and unreachable server helpers (heartbeat, data API, maps, voice transcription, storage proxy, image generation, storage, notification, cookies, shared constants).
- The five Manus hostnames in `vite.config.ts`, four stale ignore entries, and 13 npm packages (lockfile 856 to 487 packages; none added or re-versioned).
- **Kept on purpose:** the optional Coach AI client (`server/_core/llm.ts`) with its two variables, and `client/public/manus-routes.json`.

### Open items and decisions (for the owner)

- **`client/public/manus-routes.json`** is retained because an external consumer cannot be ruled out; nothing in this repository reads it. Delete it once you are sure.
- **Consent wording (UI not changed):** the Coach checkbox says "for this question" but stores a saved account preference that applies to later questions, and the consent labels do not name the external provider. The free-text Coach question is sent as typed. Changing this needs a code change.
- **AI provider:** `MANUS_API_URL` and `MANUS_API_KEY` are historical names for an OpenAI-style endpoint; the model names are hard-coded; no real provider has been tested.
- **Unused leftovers that were deliberately kept:** the `appId`, `cookieSecret`, `databaseUrl`, `oAuthServerUrl` and `isProduction` getters in `server/_core/env.ts` (nothing reads them); `ownerOpenId` in `env.ts`, read only by the unused `upsertUser` in `server/db.ts` (which, with `getUserByOpenId`, has no caller); the empty folder `server/_core/types/`; `app.config.ts` (imported by nothing); `ErrorBoundary.tsx`, `contexts/ThemeContext.tsx`, `hooks/usePersistFn.ts` and many shadcn `ui/*` components; the packages `framer-motion`, `@hookform/resolvers`, `add`, `tw-animate-css`, `tailwindcss-animate`, `@tailwindcss/typography`, `autoprefixer`, `postcss` and the `pnpm` dev dependency; and a generated, uncommitted folder `node_modules/.pnpm/cookie@1.0.2` that the lockfile no longer references. The comment at `drizzle/schema.ts:22` still calls `openId` a Manus identifier; the column is still required, and local registration fills it with a random `email_...` value.
- **Production runtime needs dev dependencies:** the server bundle imports `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` and `@builder.io/vite-plugin-jsx-loc` at runtime (through `server/_core/vite.ts` and `vite.config.ts`), so do not prune devDependencies in a production image.
- **`pnpm check` does not typecheck test files** (`tsconfig.json` excludes `**/*.test.ts`); Vitest is the only check on them.
- **Repository hygiene before a first push:** every file uses LF line endings except `client/src/main.tsx` and `server/app-api.http.test.ts` (CRLF); there is no `.gitattributes`, no `LICENSE` file (although `package.json` says MIT) and no CI; and `HANDOFF.md` refers to the local backup folders below, which exist only on this machine.
- **Unverified:** Node 22 (the Dockerfile uses it), MariaDB (documented as an option), and the browsers and behaviours listed under "Owner-reported manual verification".
- **Known pre-existing warnings:** the client chunk exceeds 500 kB; `recharts@2.15.4` is deprecated; `@builder.io/vite-plugin-jsx-loc` declares a peer of vite 4 or 5 while the project uses vite 7.
- **CSV import** appends holdings with ids like `csv-<row>-<symbol>`, so importing the same file twice creates duplicate ids (this already affects the holdings table's React keys).

### Backups (local only, outside the project, none contains `.env`)

`..\portpilot_phase0_backup_original`, `..\portpilot_phase1_pre_option_a_backup`, `..\portpilot_stage2_pre_cleanup_backup`, `..\portpilot_cs2_pre_change_backup`, `..\portpilot_regfix_pre_change_backup`, `..\portpilot_keylog_pre_change_backup`, `..\portpilot_cs3_pre_change_backup`, `..\portpilot_cs4_pre_change_backup`, `..\portpilot_cs5_pre_change_backup`, `..\portpilot_cs6a_pre_change_backup`, `..\portpilot_cs6b_pre_change_backup`, `..\portpilot_cs6b2_pre_change_backup`, `..\portpilot_cs89_pre_change_backup` and `..\portpilot_docs_pre_change_backup`.

---

# Phase 0 — local portability, Manus decoupling (historical)

**Historical status (Phase 0), superseded by "Current state" above:** at the time, the Phase 0 release gate was open: code, typecheck, unit tests, build and DB-less startup were verified, and everything that needed a real MySQL database was not yet verified.

Original untouched backup: `..\portpilot_phase0_backup_original` (full copy taken before any edit, before `node_modules` existed). The project was not a Git repository, so there is no Git checkpoint.

## Files changed and why

| File | Change | Reason |
| --- | --- | --- |
| `package.json` | `dev` and `start` now run through `scripts/with-node-env.mjs` | `NODE_ENV=x cmd` is POSIX-only and fails in Windows cmd/PowerShell. Behaviour on Linux/Docker is unchanged (same `NODE_ENV` values). No dependency added; lockfile untouched. |
| `scripts/with-node-env.mjs` (new) | 17-line launcher that sets `NODE_ENV` then runs the command | Replacement for the POSIX prefix above. |
| `vite.config.ts` | Removed the Manus browser-log collector plugin (~140 lines), its dev-only HTML injection, and now-unused imports | Obsolete debug tooling. It only ran in dev and wrote logs to `.manus-logs`. The `manus-public-platform-config` plugin was **kept** (it serves `/api/platform/config.js`, covered by a passing test). |
| `client/public/__manus__/debug-collector.js` | Deleted (plus the empty `__manus__` dir) | Browser half of the collector; nothing else referenced it. |
| `.manus-logs/` | Deleted (empty dir) | Collector output location. |
| `.manus-starter-init.json`, `template.json` | Deleted | Manus scaffolding metadata. Grep confirmed nothing reads them. |
| `app.config.ts` | `logoUrl` now `/portfolio-pilot.svg` | Was an external `files.manuscdn.com` URL. The local asset already exists and is the favicon. Nothing in code imports this file. |
| `client/index.html` | Removed a template comment block marked "BLOCK TO BE DELETED" | Comment only; no behaviour change. |
| `drizzle/0001_local_auth_and_state.sql`, `drizzle/meta/0001_snapshot.json`, `drizzle/meta/_journal.json` | New additive migration, generated by `drizzle-kit generate` (no DB connection) and reviewed | Checked-in migrations only created `users`, without `passwordHash`, `app_sessions` or `portfolio_states`, so a fresh DB could not run the app. `0000` and its snapshot are byte-identical to the originals. |
| `.env.example` | Rewritten; same variable names, `MANUS_*` marked optional/legacy and blank, local `DATABASE_URL` guidance | Placeholder `MANUS_API_URL=https://api.example.invalid` etc. implied they were required. |
| `README.md` | Added "Local setup" section; qualified the sentence claiming the tables pre-exist | Reproducible setup. |
| `HANDOFF.md` (new) | This file | |

## Preserved (deliberately not touched)

- **All auth code**: `/api/app/*` email/password auth (scrypt, hashed opaque session tokens, CSRF/origin checks, rate limits), cookie options, `app-security.ts`, `app-repository.ts`, `app-api.ts`.
- **All financial code and data**: `shared/*`, `client/src/data/demo.ts`, `App.tsx`, `BacktestPage.tsx`, `AppContext.tsx`.
- **Schema**: `drizzle/schema.ts` and `0000` migration unchanged.
- **Manus OAuth / tRPC layer, retained on purpose** (**Superseded by Phase 1b:** these files are still in the repository, but the server entry point no longer imports or mounts them): `server/_core/{sdk,oauth,context,cookies,trpc,systemRouter,env}.ts`, `server/routers.ts`, `client/src/{main.tsx,const.ts,lib/trpc.ts,_core/hooks/useAuth.ts}`, `DashboardLayout`, `ManusDialog`, `ComponentShowcase`, `Map`, `AIChatBox`, `server/storage.ts`, the other `_core` helpers, `publicConfig.ts`, and the two tests that cover them (`auth.logout.test.ts`, `platform.test.ts`).
  - Traced finding: the routed UI authenticates **only** through `/api/app/*` (`AppContext.tsx`). No routed page calls `trpc.*`, `useAuth`, `startLogin` or `ManusDialog`; they are template leftovers. `_core/llm.ts` **is** active (dynamically imported by the optional Coach AI) and degrades to deterministic output when `MANUS_API_URL` is empty.
  - Why not removed now: removal touches ~15 files and 2 test files, and the replacement (local auth) has no HTTP-level integration test yet. Per the change-control rules, OAuth is not removed until that is in place. Cost of keeping it: one harmless startup log line (`[OAuth] ERROR: MANUS_OAUTH_API_URL is not configured`). *(Historical: this log line no longer appears since Phase 1b.)*
- `client/public/manus-routes.json`, and the Manus domains in `vite.config.ts` `server.allowedHosts` (harmless; `localhost` is present).

## Tests actually run (Windows 11, Node 24.13, pnpm 10.18)

*Historical: this is the Phase 0 baseline (38 tests). The current suite is 68 tests; see Phase 1b.*

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| **Baseline** (original code): `pnpm check` / `pnpm test` / `pnpm build` | clean / 38 of 38 passed (5 files) / built |
| After changes: `pnpm check` | clean |
| After changes: `pnpm test` | 38 of 38 passed (5 files) |
| After changes: `pnpm build` | built (`dist/index.js` 106.0 kB) |
| `pnpm start` on Windows with no `.env`, no DB | started; `/api/health` returned `{"status":"ok"}`; `/` returned 200 |
| `pnpm dev` on Windows with no `.env`, no DB | started in development mode (Vite middleware active); `/api/health` ok; `/` 200 |
| `drizzle-kit generate` | produced `0001` (3 tables detected); output reviewed by hand |

Pre-existing, not caused by this work: the Vite build prints `<script src="/api/platform/config.js"> ... can't be bundled without type="module"` and a >500 kB chunk warning; both appear in the baseline build too.

## Not yet verified (gate open)

*Update (2026-10-11, owner-reported manual check, Chrome, not independently verified): after the existing migrations were applied to a local MySQL database, items 1 and 2 below worked (migrations applied; registration, sign-in, reload persistence, sign-out and re-sign-in), which also implies that the session cookie was accepted on `http://localhost` (item 4) and that the demo pages rendered (item 5). Item 3, persistence across a server restart, was not reported. The original text follows unchanged.*

Needs `DATABASE_URL` for an empty MySQL database (user is creating `.env`):

1. `pnpm db:migrate` applies `0000` + `0001` to an empty DB without error.
2. Registration, login, session restoration (reload), logout, against that DB.
3. That account state persists across a server restart.
4. That the `Secure; SameSite=None; Partitioned` cookie is accepted over `http://localhost` in a real browser. The README currently says Chromium and Firefox accept it; **that is from general knowledge, not tested here**.
5. Demo entry and rendering of the existing pages in a browser (no browser interaction has been performed in this phase).

## Known issues and limitations

- `0001` is for **new, empty** databases only; it will fail on a DB that already has `app_sessions`/`portfolio_states` (e.g. the original managed DB). Do not use `pnpm db:push` for setup.
- `drizzle.config.ts` throws if `DATABASE_URL` is unset, so every `db:*` command needs it.
- Safari is expected not to store the `Secure` cookie over plain HTTP (not tested).

## Manual configuration required

1. Create an empty MySQL database and a dedicated user; put `DATABASE_URL` in `.env` (copy `.env.example`).
2. Run `pnpm db:migrate` once.

## Next phase

*(Historical: since done or changed. The HTTP-level test was added and the OAuth route and tRPC mount were removed in Phase 1b. The Phase 0 gate itself remains open because the MySQL and browser items are still unverified.)*

Close the Phase 0 gate: run the five unverified items above and record results here. Then, as a separate decision, add an HTTP-level test for `/api/app` register/login/session/logout and only then remove the unused Manus OAuth/tRPC layer. Onboarding validation, risk questionnaire, financial-engine and UI work remain out of scope until Phase 0 is closed.

---

# Phase 1a — DB-independent work (done while MySQL setup is deferred)

Scope agreed with the user: onboarding validation, risk questionnaire, frontend interaction and calculation correctness, with automated tests. No database, auth, schema, migration or cookie change was made. Nothing here claims database-backed behaviour works.

## Changes

| File | Change | Reason |
| --- | --- | --- |
| `shared/onboarding.ts` (new) | Pure profile-step validation (`validateProfileDraft`), the 8 risk questions with per-question answer labels, `assessRisk` | Previously nothing was enforced: the age `min=18` was only an HTML hint, negative amounts were accepted, and all 8 answers defaulted to the middle option so **Complete setup** produced a "risk profile" without a single answer. Limits mirror the server schema (`age` is an integer 18–120; money fields are finite and not negative). |
| `shared/onboarding.test.ts` (new) | 10 tests | Required fields, age bounds, bad money, blank-money-is-0, non-blocking warning, unanswered/partial/out-of-range questionnaires, and every score-band boundary (22/25, 47/50, 72/75). |
| `client/src/App.tsx` (`Onboarding()` only) + one import | Step 1 edits a local draft and validates on **Continue**; step 2 requires all 8 answers (inline "Please answer this question"); scoring now calls the existing `riskProfileFromAnswers` through `assessRisk` instead of duplicated inline math; **Complete setup**/Back are locked after success to stop double submit | Questions, 0–4 scale, bands and stored fields (`riskProfile`, `riskScore`) are unchanged, so saved data and the server schema are unaffected. Optional fields are labelled "(optional)". |
| `client/src/index.css` | `.field-error`, `aria-invalid` border, select width 210→300px | Needed for the new messages and longer answer labels. |
| `shared/finance.ts` (`goalProjection`) | `status` and `shortfall` ignore a relative gap ≤ 1e-9 | **Bug found by sweep:** in 122 of 810 input combinations, saving exactly the app's own "required monthly contribution" did not read On Track (worst gap 2.2e-16, pure float noise). Formulas themselves were verified correct and are unchanged. |
| `shared/finance.test.ts` | +6 tests | Required-contribution round-trip sweep (>500 cases), hand-computed 0%-return case, real-shortfall statuses, past/invalid target dates, and finite output for empty or zero-value portfolios. |

Behaviour change to be aware of: a user can no longer finish onboarding without answering all questions. Existing accounts and demo personas that already have a risk profile are unaffected.

## Verified (actual runs, Windows, Node 24.13)

| Check | Result |
| --- | --- |
| `pnpm check` | clean |
| `pnpm test` | 54 of 54 passed in 6 files (38 original + 16 new) |
| `pnpm build` | built |

## NOT verified

- **The onboarding UI has not been exercised in a browser.** No browser automation was available and no component-test library is installed (none was added). Typecheck, build and the logic tests pass, but rendering, layout of the longer dropdown labels on a narrow screen and keyboard/screen-reader behaviour are unchecked.
  Manual check: run `pnpm dev`, open http://localhost:3000/onboarding (works as a guest), then confirm: (1) **Continue** with empty fields shows errors on Name, Age and Experience; (2) age 17 and 121 are rejected; a negative income is rejected; (3) with valid data, **Continue** moves to step 2; (4) **Complete setup** with nothing chosen flags all 8 questions; (5) after answering all, the profile message appears and the page goes to `/portfolio`.
- A signed-in user finishing onboarding triggers a state save to `/api/app/state`. That path needs MySQL and is **pending** (see below). Because the draft is only committed on **Continue**/**Complete**, a save now happens twice per onboarding instead of on every keystroke; this should be confirmed against the database.

## Pending on MySQL (deliberately deferred, unchanged from Phase 0)

1. `pnpm db:migrate` on an empty database (`0000` + `0001`).
2. Register, login, session restore, logout, and persistence across a server restart.
3. Cookie acceptance over `http://localhost` in a real browser.
4. Saving onboarding results for a signed-in account.
5. Password recovery: not implemented and out of scope for now (it would also need an email/token store, i.e. a schema change).

## Next

Either continue DB-independent work (browser-verify onboarding manually per the checklist above; Settings page profile editing still uses the old unvalidated inputs and is the natural next target, at `client/src/App.tsx` around the "riskProfile" select), or provide `DATABASE_URL` to close the Phase 0 gate.

---

# Phase 1b — OAuth/tRPC isolation (Option A) + HTTP baseline test

Checkpoint taken first: `..\portpilot_phase1_pre_option_a_backup` (new; the Phase 0 backup `..\portpilot_phase0_backup_original` is untouched). No files were deleted. No dependency, schema, auth, cookie, CSRF, rate-limit, AI-provider or UI change.

## Changes

| File | Change |
| --- | --- |
| `server/app-api.http.test.ts` (new, test only) | 14 HTTP-level tests of `/api/app/*` using a real Express server on an ephemeral port and an **in-memory** `AppRepository` injected through the router's existing `repository` parameter. No production code was changed to make it pass. |
| `server/_core/index.ts` | Removed 4 imports (`createExpressMiddleware`, `registerOAuthRoutes`, `appRouter`, `createContext`), the `registerOAuthRoutes(app)` call, and the `/api/trpc` mount. `/api/health`, `/api/platform/config.js`, `/api/app`, body parsers, Vite/static serving and the port check are unchanged. |

All legacy files (`sdk.ts`, `oauth.ts`, `context.ts`, `routers.ts`, `trpc.ts`, `systemRouter.ts`, `cookies.ts`, `notification.ts`, and the client tRPC/`useAuth` code) are **still in the repository**, now unreferenced by the server entry point. Their two unit tests still import them directly and still pass.

## What the new test covers (route logic only)

Anonymous session and no-store headers; registration (201, cookie flags `HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=2592000`, scrypt-hashed password, SHA-256-hashed session token, lower-cased email, empty non-demo state, no `passwordHash`/`openId` in the response); duplicate email in a different case (409), weak password and unknown-field rejection (400); session restore, and unknown, malformed or expired token treated as signed out; login, identical 401 body for a wrong password and an unknown email; logout revokes only that session and tolerates no cookie; per-account state with `dataOrigin` forced to `account` and cross-account isolation; invalid state rejected without overwriting; CSRF/origin blocking (foreign origin, `Sec-Fetch-Site: cross-site`, no origin, wrong port, non-JSON 415); session list/revoke (own session 409, another account's 404); password change (current password required, length enforced, other sessions revoked, credentials swapped); account deletion requires the password and removes data; Coach stays deterministic without consent, uses an injected AI with consent, falls back when the AI returns nothing; login rate limit returns 429 with `Retry-After`; and the **default Manus-backed Coach with no Manus configuration** falls back to the deterministic answer with **zero outbound requests** (outbound `fetch` was trapped).

The test was mutation-checked: deliberately breaking an expectation about the origin check and the token hashing made the corresponding tests fail.

## Results (actual runs, Windows, Node 24.13)

| Check | Baseline (before edit) | After edit |
| --- | --- | --- |
| `pnpm check` | exit 0 | exit 0 |
| `pnpm test` | 68 of 68 passed, 7 files | 68 of 68 passed, 7 files |
| `pnpm build` | built; `dist/index.js` 106.1 kB | built; `dist/index.js` 88.5 kB |
| Legacy symbols in `dist/index.js` (`SDKServer`, `registerOAuthRoutes`, `createExpressMiddleware`, `notifyOwner`, `OAuthService`) | present | all absent |

*The "Before" column below is the historical baseline taken immediately before the Phase 1b edit; "After" is the state at the end of Phase 1b.*

Runtime probes, same script before and after, no `.env`, no `DATABASE_URL`, no `MANUS_*`, in both production-build and `pnpm dev`-style (development) modes:

| Request | Before | After |
| --- | --- | --- |
| `GET /api/health` | 200 `{"status":"ok"}` | same |
| `GET /api/platform/config.js` | 200, empty config | same |
| `GET /api/app/session` | 200, null user and state | same |
| `POST /api/app/login` (valid origin, no DB) | 500 (log: "Database is not available") | same |
| `POST /api/app/login` (foreign origin) | 403 | same |
| `GET /manus-routes.json`, `GET /` | 200 | same |
| `GET /api/trpc/auth.me` | 200 JSON `null` | 200 **web page HTML** (expected, route removed) |
| `GET /api/oauth/callback` (none / forged) | 400 / 403 | 200 **web page HTML** (expected, route removed) |
| Startup log | `[OAuth] Initialized...`, `[OAuth] ERROR: MANUS_OAUTH_API_URL...`, `[Auth] Missing session cookie` | **`Server listening` only** (plus the DB error logged by a request) |

Note: in the development-mode runs after the edit, a notice from the transitive dev package `baseline-browser-mapping@2.8.12` ("data is over two months old") appeared. It was not in the baseline dev log. It has no code path to this change; it is tooling output and I have not established why it did not appear before.

## Behaviour change to be aware of

`/api/trpc/*` and `/api/oauth/callback` now return the app's HTML page (status 200) instead of JSON or an error. Nothing in this repository calls them. Anything external that did would stop working.

## NOT verified (unchanged by this phase)

- **The in-memory test is not database verification.** It does not exercise MySQL, the SQL in `app-repository.ts` (e.g. the real `ER_DUP_ENTRY`, unique constraints, cascade deletes, timestamp handling), persistence across restarts, or `db:migrate`.
- **No browser was used.** Cookie acceptance over `http://localhost` is still untested. The test client reads `Set-Cookie` and replays it manually.
- Real registration, login, session restore, logout and persistence against MySQL remain **pending** (as in Phase 0).
- The Coach's real Manus model path was not exercised with credentials.

## Next (awaiting review; not started)

*(Update: a read-only Phase 2 audit and then the documentation-only Phase 2A below followed this section.)*

Remaining Manus-related code is dormant but present: the files listed above, `client/src/main.tsx` tRPC wiring, `ManusDialog`, `startLogin`, the `manus-cookie` storage key, the `/api/platform/config.js` bridge and its Vite plugin, `manus-routes.json`, and Manus hostnames in `vite.config.ts`. None of that has been touched. The Coach AI still targets the Manus API when configured.

---

# Phase 2A — documentation-only corrections

Scope: Step 1 of the Phase 2 residual-integration audit. Only `README.md`, `.env.example` and `HANDOFF.md` were edited. No source code, tests, dependencies, database schema, UI or runtime behaviour changed, and no file was deleted.

## What was corrected

- **README**: removed hosted-platform wording ("managed LLM helper", "managed MySQL") from the architecture table and technology paragraph; qualified the "tables pre-exist" and "cross-site Preview iframe" statements as belonging to the original hosted environment, not local development; noted that Coach/report AI is the only optional feature that can contact a third-party service; explained that `MANUS_API_URL`/`MANUS_API_KEY` are historical names for an OpenAI-style endpoint, that the model names are hard-coded, and that no real provider has been tested.
- **README privacy paragraph**: now states that, when both consents are present and an endpoint is configured, the server may send the external provider a minimized numeric summary **and, for Coach, the user's free-text question exactly as typed** (up to 500 characters, unfiltered). It also says the in-app consent labels do not yet name the provider. (The UI text itself was not changed.)
- **.env.example**: same variable names and blank values; `MANUS_API_URL`/`MANUS_API_KEY` described as the optional AI endpoint (including that the URL is also served to browsers by `/api/platform/config.js`); `MANUS_PROJECT_ID`, `MANUS_JWT_SECRET`, `MANUS_OAUTH_API_URL` marked unused by the running server. No credentials were added or exposed.
- **HANDOFF.md**: added a reading guide and **Historical/Superseded** markers to the Phase 0 statements and probe results that Phase 1b changed; preserved all original content.

## Verification performed

- Diff against pre-edit copies of the three files (kept outside the project) shows changes only in those files; a modified-since-snapshot file scan found no other changed project files.
- Repository search (excluding `node_modules`, `dist`, the lockfile) for the outdated phrases ("managed LLM", "managed MySQL", "managed WebDev/server/database/environment", "not used by the app UI", "legacy Manus platform values", "sends minimized numeric summaries", "harmless startup log line", "pre-exist"): **no unqualified occurrence remains in the three edited files.** Remaining hits are intentional: `README.md:57` (explicitly "In the original managed WebDev environment"), and historical HANDOFF lines now marked as such.
- **Outdated wording that remains in documents outside this step's scope (not edited):** `plan.md` lines 13, 53, 54, 64, 68 ("managed MySQL", "managed LLM client"); `TODO.md:50` ("managed database/migrations"); `docs/venture/regulatory-and-data-boundaries.md:47` ("The managed LLM is optional and called server-side…"). The venture document's description of what AI receives should be re-read against the README's new privacy paragraph before it is relied on.

## Still NOT verified (unchanged)

- Registration, login, session restore, logout and persistence against MySQL.
- Cookie acceptance over `http://localhost` in a real browser.
- Coach/report AI against a real provider.
- The HTTP-level tests use an in-memory repository and prove route logic only.

## Next

Awaiting approval. Next planned step from the Phase 2 audit: Coach hardening (timeout, retry cap, tests with a stubbed provider), then the config-bridge removal; neither has been started.

---

# Phase 1c — registration investigation, React keys and safe error logging

## Registration failure (diagnosed read-only)

A registration attempt returned HTTP 500 with the generic "request could not be completed" message. Two stacked causes were identified (the first was inferred from process and file timestamps and was not confirmed from the server log; the second was confirmed by inspection):

1. **A stale server process.** The dev server had started before `.env` was created, and a server reads `.env` only at startup, so it had no `DATABASE_URL`. `getDb()` then returned `null`, `database()` threw "Database is not available" and the route returned the generic 500. This follows from the process start time and the file's timestamps; the terminal log line itself was not available to the assistant.
2. **An empty database.** A read-only inspection (a `SELECT`/`SHOW`-only script in a read-only session, run through the same `dotenv` loading as the server, printing no credentials) showed that the connection worked, the target was `portfoliopilot`, the account had all privileges on that database only, and there were no tables and no migration record.

The migration files were reviewed as consistent (journal, both SQL files and both snapshots). The migrations were applied by the owner, not by the assistant. The owner then reported the flows working (see "Current state"). No migration was run and no database write was made by the assistant.

## React keys and safe logging

- **React keys:** 16 `.map()` sites in `client/src/App.tsx` returned elements without a `key` (3 reported from the browser console plus 13 more on pages not yet opened). All were given stable identifiers (sector name, scenario id, asset bucket, holding id, goal id, coach message id, report heading, report id, notification id, session id and similar). A scan of all `.map()` callbacks returning JSX now finds 0 of 48 without a key. This was checked with a script and typecheck; it was not checked in a browser.
- **Safe error logging:** drizzle query errors embed the SQL and its bound parameters (email, name, password hash) in their message, and the API logged that message. `server/safe-error.ts` (`describeError`) now reports only a category (`database-query`, `database-connection`, `database-unavailable` or `unexpected`) plus validated driver code, errno, SQLSTATE and class name, and never copies message text. It is used by `safeError` in `server/app-api.ts` and by the two log sites in `server/db.ts`. `server/safe-error.test.ts` adds 18 tests, including checks that the raw error message really does contain the secrets and that the log does not. The test suite was 119 tests at that point.

# Phase 2B — Coach AI hardening

`server/_core/llm.ts` outbound requests are now bounded; the provider, consent gating, rate limits, CSRF/origin checks and data minimization were not changed.

- **Chat request:** 15 second timeout, no retry. **Model discovery:** 4 second timeout per attempt, at most one retry after a 250 to 500 ms delay; a provider `Retry-After` is honoured only up to 1 second. Only timeouts, network errors, HTTP 429 and 5xx are retried. The response body read is raced against the abort, so the bound does not depend on the fetch implementation.
- **Errors and logs:** error messages carry only a status or a timeout message, never the provider's response body. After any failure AI is paused for 60 seconds (existing behaviour) and the deterministic answer is returned.
- **Tests:** `server/coach-ai.test.ts`, 34 tests against a stubbed provider: success, non-2xx, malformed and empty replies, timeouts, retry limits, cooldown, minimization of the outbound body, and no outbound request when the endpoint is unconfigured or consent is absent. `callManagedModel` is exported for these tests.
- **Not verified:** any real provider.

# Cleanup record: CS-1 to CS-9

Every step followed the same procedure: a new checkpoint folder first (excluding `.env`, `node_modules` and build output); a fresh import-graph check of each target across source, tests, scripts, configuration and dynamic imports; the change; then `pnpm check`, `pnpm test` and `pnpm build` with a placeholder `DATABASE_URL`, with build artifacts compared before and after.

| Step | What was removed or changed | Tests after |
| --- | --- | --- |
| CS-1 | Public-config bridge: the `/api/platform/config.js` route, its `<script>` tag, the Vite plugin, `server/_core/publicConfig.ts` and its test | 101 |
| CS-2 | `client/src/main.tsx`: the tRPC/React Query bootstrap was replaced by the minimal entry point after confirming that nothing `App` reaches uses those providers (client JS 920,982 to 821,584 bytes) | 101 |
| (between) | React keys and safe error logging (Phase 1c) | 119 |
| CS-3 | 12 unreachable client files: `ManusDialog`, `Map`, `AIChatBox`, `DashboardLayout`, `DashboardLayoutSkeleton`, `pages/Home`, `pages/NotFound`, `pages/ComponentShowcase`, `_core/hooks/useAuth`, `const.ts`, `lib/trpc.ts`, `platform.d.ts` (client JS byte-identical; CSS 110,960 to 98,393 bytes because the removed components' Tailwind classes dropped out, with 0 removed classes still used) | 119 |
| CS-4 | 5 unreachable server helpers: `heartbeat`, `dataApi`, `map`, `voiceTranscription`, `storageProxy` | 119 |
| CS-5 | `imageGeneration.ts`, `server/storage.ts` and the image-generation test | 118 |
| CS-6A | `server/_core/oauth.ts`, `server/_core/types/cookie.d.ts` | 118 |
| CS-6B step 1 | `sdk.ts`, `types/manusTypes.ts`, `context.ts`, `trpc.ts`, `systemRouter.ts`, `routers.ts`, `auth.logout.test.ts` and the signed-session test in `platform.test.ts` | 116 |
| CS-6B step 2 | `notification.ts`, `cookies.ts`, `shared/const.ts` and the cookie-options test | 115 |
| CS-8 | Five Manus hostnames from `allowedHosts` in `vite.config.ts` (they affected only `pnpm dev:static`; `pnpm dev` replaces that block); `.manus-logs` and `*.manus-starter-*` from `.dockerignore`; `.webdev/` and `client/public/__manus__/version.json` from `.gitignore` (server bundle 92,808 to 92,653 bytes, entirely from the hostname edit) | 115 |
| CS-9 | 13 packages: `@trpc/client`, `@trpc/react-query`, `@trpc/server`, `@tanstack/react-query`, `superjson`, `axios`, `jose`, `cookie`, `streamdown`, `date-fns`, `@types/google.maps`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`. `mysql2` and all build and start dependencies were kept; `date-fns` and `cookie@0.7.1` remain only as transitive dependencies of `react-day-picker` and `express`. Lockfile 856 to 487 packages with none added or changed; `pnpm install --frozen-lockfile` exit 0 | 115 |

**Reordering:** the originally planned CS-6 and CS-7 could not be applied separately, because `context.ts` (a CS-7 file) imported `sdk.ts` (a CS-6 file) and `oauth.ts` imported `cookies.ts`. This was proven in scratch copies outside the project, and the work was regrouped as CS-6A, CS-6B step 1 and CS-6B step 2; there was no separate CS-7.

# Documentation update (2026-10-11)

Edited, documentation and example file only: `.env.example` (removed the three unused OAuth variables and the false claim that variables are served to browsers), `HANDOFF.md`, `plan.md`, `TODO.md`, `README.md` (Node version claim, the `MANUS_*` setup instruction, cookie status, test description) and `docs/venture/regulatory-and-data-boundaries.md` (AI behaviour, data sent, consent wording and error-log statements aligned with the code and the README). No source code, tests, manifest, lockfile, `.env`, database or `client/public/manus-routes.json` was touched. `ideas.md` and the other venture documents were scanned and have no stale infrastructure statements.

**Next (owner decisions):** the open items above, then repository preparation. Git has not been initialised and nothing has been staged, committed or pushed; that needs the owner's explicit approval.
