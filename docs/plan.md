# PortfolioPilot implementation plan

> **Status note (2026-10-11):** this is the original implementation plan, written for a hosted build. The product requirements and quantitative methodology below still describe the intended behaviour. The architecture, module, serving and verification sections were corrected after the Manus-infrastructure cleanup (the tRPC/OAuth server code, the public-config script and other hosted-platform pieces were removed). For setup and current status see `README.md` and `HANDOFF.md`; open acceptance items are tracked in `TODO.md`.

## Product outcome and constraints

Deliver PortfolioPilot, a responsive Indian retail-investor WealthTech prototype with the tagline **“Your portfolio. Your goals. Your all-weather strategy.”** The product helps users understand portfolio context, goal progress, diversification and illustrative resilience; it is not a broker or trading system. The approved scope requires an immediately usable synthetic *portfolio* demo, two sample personas, CSV import, account-scoped saved state, deterministic analytics, explicit optional AI explanation, reports and persistent educational disclaimers. No brokerage credentials, live-price dependency, trade execution, money movement, guaranteed-return language, precise price prediction or claim of regulatory approval is in scope.

Demo portfolios, stress assumptions and demo-only correlation illustrations are explicitly labelled synthetic. The product must never imply that synthetic portfolio inputs or synthetic correlations are empirical historical performance. The backtest is unavailable until the user imports a monthly return dataset; do not seed sample/backtest returns, invent correlations or present simulated performance as evidence. Goal output is a deterministic projection only: do not show a goal success probability unless a separately validated probabilistic model is implemented with explicit assumptions and adequate data. Current scope removes the heuristic likelihood indicator.

Use a restrained professional fintech visual system: deep navy, Harbor Blue and off-white, with sparing status colors, accessible controls and responsive layout. The required disclaimer is: “PortfolioPilot is an educational and analytical prototype. Simulations and recommendations are illustrative and do not constitute personalized investment advice or a guarantee of future returns.”

## Architecture decisions

Keep the initialized React 19 + TypeScript + Vite + Tailwind CSS v4 + Wouter + Recharts + Lucide frontend and Express + TypeScript + Drizzle ORM + MySQL backend (any MySQL 8-compatible server you run). The project is a browser-rendered SPA delivered by the Express application in production; Vite serves the frontend in development. Server and database are enabled because account authentication and durable account-scoped state are product requirements. Keep relative same-origin browser URLs (originally required so a cross-site hosted Preview iframe could proxy the application without embedding an internal host; harmless for local use).

A single typed, versioned `PortfolioState` contract in `shared/portfolio.ts` is shared between browser and server. Add optional, backward-compatible user-uploaded historical-return provenance/configuration fields to the existing state JSON (no separate table/migration needed). Bound uploaded observations and keep the existing account payload-size limit. Pure deterministic calculations remain outside AI and UI: portfolio/goal/stress/diversification engines live in `shared/finance.ts`; monthly return parsing and backtest metrics live in `shared/backtest.ts`. Browser views, report generation, deterministic Coach and server AI-context construction reuse the same engine result rather than reimplementing formulas. AI is explanation only: it may use minimized server-derived numeric aggregates when—and only when—the account user has explicitly enabled the corresponding Coach or report consent. Never send raw historical rows, source files, names, emails or security identifiers to the LLM. Deterministic output remains available for guests and whenever model access is unavailable.

## Product flows and views

1. Public landing explains the product, sample analytics, privacy/no-trading boundary and offers portfolio analysis/account creation or guest demo entry.
2. Guest selects Vikram Nair or Meghna Sharma and enters a local synthetic portfolio; the workspace visibly identifies Demo Data and does not call the account AI API.
3. Email/password account registration creates a valid empty persisted state and session, then onboarding records an editable profile and an eight-question educational Portfolio Risk Profile. Sign-in restores the account's own state. Guest state remains browser-local.
4. The dashboard summarizes portfolio value, gains, goals, allocation, risk, concentration, stress and history. Portfolio views combine a sortable/searchable holdings table, CSV/manual entry, allocation, sectors, concentration, market/geography facets and a correlation view. Synthetic correlations are shown only in demo mode and labelled illustrative; user portfolios use a measured matrix only when sufficient user-uploaded return observations support it.
5. Goal views create and manage multiple goals with inflation-adjusted targets, time remaining, deterministic projections, required contributions and explicit status thresholds. Never describe the deterministic status as a probability or likelihood.
6. Stress testing applies editable percentage-point scenario assumptions to the current holdings and calculates portfolio/holding/goal impacts and illustrative recovery assumptions.
7. The All-Weather-inspired view compares current exposure with an illustrative balanced target across growth, inflation, deflation and recession/slowdown regimes. Rebalance is review-only; it estimates drift and currency adjustments without executing them.
8. A new `/backtest` view accepts a user-selected monthly return CSV, captures source/date-range/upload/currency/frequency/return-basis/missing-value provenance, lets users edit baseline and All-Weather-inspired target weights, and compares both strategies on one common period and one documented cost/rebalance/risk-free-rate convention. Until imported observations are valid and complete, show an explanation and no performance metrics. Provide CAGR, annualized volatility, Sharpe, maximum drawdown, recovery duration, total/selected-period returns, available event-window performance, equity curve and assumptions. Display source, data date range, update time, currency, return basis, missing-data treatment and `user-uploaded / unverified` status alongside results. Do not fetch live prices or create empirical-looking sample rows.
9. Coach/report, in-app notices, profile/settings/security, export, account deletion and help complete the end-to-end product. Reports/Coach receive the exact shared calculated backtest result when available; otherwise they state that no historical dataset was imported.

Core routes in source (a copy of this list is still shipped as `client/public/manus-routes.json`, see the serving section): `/`, `/login`, `/register`, `/onboarding`, `/dashboard`, `/portfolio`, `/stress-test`, `/goals`, `/goals/:id`, `/rebalance`, `/backtest`, `/ai-coach`, `/reports`, `/notifications`, `/settings`, `/help`.

## Quantitative methodology and guardrails

- Monthly CSV inputs use explicit INR asset-bucket series (Equity, Mutual Funds, Gold, Debt, Cash), with flexible date/return-header aliases; monthly simple returns are entered in percentage points (for example `1.2` means `1.2%`, internally `0.012`). Reject duplicate periods, invalid values, returns at or below -100%, non-monthly/unparseable dates and unsupported bucket aliases; empty/missing observations stay missing and are never filled with zero or forward-filled.
- User sets/edits baseline weights; default baseline is current holding value by bucket when available. An editable All-Weather-inspired comparison default is Equity 30%, Mutual Funds 20%, Gold 15%, Debt 30%, Cash 5%. It is a product comparison profile, not a universal recommendation and not a claim to reproduce any named investor's allocation. Validate each portfolio's weights sum to 100% within the displayed rounding tolerance.
- Require a common, continuous, complete monthly window for every bucket with non-zero exposure in either strategy. Leading/trailing missing observations may shorten the common window; an internal missing month blocks metrics for that selected period and is shown so the user can correct the file/restrict the window. Do not bridge gaps, interpolate or silently select a return-favorable segment.
- Both strategies share currency, observation months, return basis, user-entered annual risk-free assumption, rebalancing frequency and flat per-rebalanced-notional cost in basis points. Default flat cost is 10 bps and is an editable modeling placeholder, not a fee quote; entry/exit costs, tax, market impact and security-level fees are explicitly excluded. Periodic turnover is `0.5 × Σ|target_weight − pre-rebalance_weight|`; apply the same cadence/cost rule to both portfolios. State whether return inputs are total-return or price-only; do not imply dividends are included when the uploaded basis says otherwise.
- `totalReturn = V_end/V_start − 1`. Monthly CAGR follows the inclusive observed calendar-day span from the first month's start through the last month's end: `(V_end/V_start)^(365/calendar_days) − 1`; annualized volatility is sample standard deviation of monthly net returns × `sqrt(12)`. Sharpe uses monthly excess returns against the user-entered annual INR risk-free assumption converted to a monthly rate and sample standard deviation × `sqrt(12)`. Zero variance yields unavailable Sharpe, not infinity. Max drawdown is the negative minimum of wealth/running peak minus one; expose peak, trough and first recovery date. If no recovery occurs within the supplied window, say “not recovered in sample.” For all metrics expose period/frequency/observation count/method/status and short-window insufficiency as applicable.
- Selected periods and event windows are calculated only from user-uploaded observations. If any named event window is not fully covered by a continuous complete series, report it as unavailable, not zero. Disclose survivorship, delisting, constituent-history, corporate-action, dividend/price-return, vendor/user verification and monthly-resolution limitations.
- Concentration uses explicit value weights. Compute holding/security HHI `Σw_i²`, sector HHI, 0–10,000 HHI display and effective holding count `1/HHI` where the denominator is positive; disclose asset-bucket and sector weights and top-three concentration. User-series correlation is an observed sample correlation from synchronized monthly returns only when at least 12 common complete observations exist; otherwise correlation is unavailable. Demo-only synthetic correlations remain clearly labelled and are never used for an account's historical result.
- Goal calculations disclose monthly compounding, an ordinary-annuity/end-of-month contribution convention, inflation assumptions and remaining monthly periods. At zero time horizon, do not fabricate a required SIP; return unavailable. Keep deterministic projected corpus/status; no fabricated probability.

## Module responsibilities

- `client/src/App.tsx`: route dispatch and product views, forms, interactions, charts, disclaimer, contextual trust labels, backtest inputs and data provenance.
- `client/src/contexts/AppContext.tsx`: session hydration, local guest state, account API calls, and optimistic/debounced persistence with visible error/status feedback.
- `client/src/data/demo.ts`: fictional Vikram/Meghna fixtures, scenarios, snapshots and labelled synthetic correlations; new empty-state creation delegates to the shared contract. No synthetic historical return file.
- `shared/portfolio.ts`: canonical types, buckets, goal categories, safe empty-state factory, user-uploaded provenance and reproducible comparison configuration.
- `shared/finance.ts`: deterministic goal, allocation, stress, HHI/concentration, correlation, rebalance, risk-profile, report, CSV and Coach calculations/explanations; no heuristic probability.
- `shared/backtest.ts`: bounded return-series CSV parser, normalized monthly dataset contract, alignment/missing-data analysis, rebalance simulation, benchmark comparison metrics, event windows and shared result/provenance envelopes.
- `server/app-api.ts`: REST boundary at `/api/app` for session, registration/login/logout, state, active sessions, password changes, account deletion, Coach and report commentary; validates and rate-limits requests, checks session ownership, and enforces consent.
- `server/app-security.ts`: scrypt password hashing/verification, input/state schemas, safe token hashing, payload limits, and minimized numeric Coach context (including the shared backtest metrics without raw rows).
- `server/app-repository.ts`: account-scoped Drizzle access to `users`, `app_sessions` and `portfolio_states`; never reads account state without authenticated owner id.
- `server/_core/index.ts`: Express/Vite/static application entry, the `/api/health` endpoint and application API mounting (`/api/app`). There is no tRPC server and no OAuth route.
- `server/_core/llm.ts`: server-only client for the optional external AI endpoint (OpenAI-style API at `MANUS_API_URL`, a historical variable name). Requests are time-bounded: 15 s for the answer, 4 s per model-discovery attempt with one retry.
- `server/safe-error.ts`: turns errors into log-safe summaries (category and driver code only, never SQL, parameters or user data). `server/db.ts`: lazy Drizzle/MySQL connection. `scripts/with-node-env.mjs`: cross-platform `NODE_ENV` launcher used by `pnpm dev` and `pnpm start`.
- `shared/onboarding.ts`: profile-step validation and the eight-question risk questionnaire.
- `drizzle/schema.ts` and checked-in migrations: MySQL tables (`users`, `app_sessions`, `portfolio_states`) and migrations `0000` and `0001`. Preserve the existing schema; the additive fields reside inside the existing bounded portfolio-state JSON, so no destructive schema change is required.
- `client/public/portfolio-pilot.svg` is the favicon/logo and `app.config.ts` holds the local logo path (application code does not import it). `client/public/manus-routes.json` is a route manifest that the original hosted platform required; nothing in this repository reads it, and it is retained pending a decision about possible external consumers.
- `docs/venture/opportunity-and-business-model.md`: requested problem/opportunity, validation method, stakeholders, personas, ecosystem, competition, regulatory, revenue/model, assumptions, pitch, MVP and roadmap deliverable.
- `docs/venture/research-notes.md`: source-by-source evidence, retrieval/coverage notes and explicit unverified items.
- Tests: `shared/finance.test.ts`, `shared/backtest.test.ts`, `shared/onboarding.test.ts`, `server/app-security.test.ts` (formulas, parsers, validation, privacy), `server/app-api.http.test.ts` (HTTP-level API tests against an in-memory repository, not MySQL), `server/coach-ai.test.ts` (Coach AI against a stubbed provider), `server/safe-error.test.ts` (log-safe errors) and `server/platform.test.ts`.

## Account security, persistence and AI boundaries

Email/password is explicitly part of the user-approved product scope. Hash passwords with Node scrypt; never store plaintext or return password hashes. Store only a hash of each random session token in the database; set the application cookie `HttpOnly; Secure; SameSite=None; Partitioned` with a finite lifetime so eligible browsers can send it inside a cross-site iframe. Validate same-origin mutation metadata/JSON content, bound payload sizes and records, rate-limit login/registration/sensitive operations, and scope every account read/update/delete by authenticated user id. Return private application data with `Cache-Control: private, no-store` and `Vary: Cookie`. Account deletion requires password confirmation and explicit user confirmation in the UI.

The optional external AI endpoint (an OpenAI-style API at `MANUS_API_URL`, authenticated with `MANUS_API_KEY`; both names are historical) is called only server-side via the project's `invokeLLM`/`listLLMModels` helper. Prefer GPT-5 Mini only when the live catalog contains it; use its GPT-family completion-token field. Requests are time-bounded and any failure falls back to the deterministic output. Model input is limited to the Coach question (the user's own text, sent exactly as typed and not filtered) plus numeric aggregate values, goal aggregates, exposure weights, risk-profile label and derived backtest summary; the structured summary omits names, email, ids, raw historical return rows, source files and holding/security names. Separate Coach and report opt-ins are off by default and enforced both in the UI and against saved server state. Without consent or a usable model response, return the deterministic engine output and identify it truthfully. Never put provider credentials in browser code.

## Persistence and API behavior

Persist account portfolio state in the MySQL database configured by `DATABASE_URL`, with one state record per user; initialize a valid empty account state on registration or recovery of a legacy state-less account. Guests and demos use local browser storage only. Treat the database as holding real account data: do not run destructive schema changes or reseed users' data. User editing, holdings import, historical-return import, goal/stress/rebalance/report generation and preferences all flow through the same validated state contract. Backtest rows are capped to a documented monthly history window that stays below the state JSON size limit; never store the source file itself.

Expected application API paths: `GET /api/app/session`; `POST /api/app/register`, `/login`, `/logout`, `/coach`, `/report-commentary`, `/password`; `GET` and `PUT /api/app/state`; `GET /api/app/sessions`; `DELETE /api/app/sessions/:id` and `/api/app/account`. Unknown API paths return JSON 404; `/api/health` remains unauthenticated. Client parsing validates returned state shapes before accepting account data.

## Serving, routes and cache policy

Development starts the existing full-stack server at the current configured port and binds `0.0.0.0`. Production uses the existing `Dockerfile` to build the frontend and server bundle and serves the SPA plus API from the container; no separate static route split or public API is needed for this private, database-backed prototype. `/api/health` is the container health path. Keep browser requests relative to the current origin. Keep account/session, historical-return dataset, and Coach/report responses `private, no-store`; do not place personalized data behind shared caching. Let the existing build/static middleware serve release assets and HTML; do not add `X-Frame-Options: DENY/SAMEORIGIN` or a restrictive `frame-ancestors` policy that breaks Preview embedding (a requirement of the original hosted Preview; for any other deployment, framing headers are a security decision to make deliberately). Public SEO indexing is not a delivery requirement.

The route manifest `client/public/manus-routes.json` (a `routes` array of page paths and titles, including `/goals/:id` and `/backtest`) was required by the original hosted platform and is still shipped and served from the site origin. Nothing in this repository reads it; it is retained pending a decision about possible external consumers and must be kept in sync with the routes in `App.tsx` while it exists.

## Project structure

```text
client/src/App.tsx                    route views, forms and application UI
client/src/contexts/AppContext.tsx    guest/account session and state lifecycle
client/src/data/demo.ts               fictional sample data and labelled scenarios
client/public/                        route manifest, SVG logo, browser assets
shared/portfolio.ts                   shared persisted state and types
shared/finance.ts                     portfolio, goal, stress and report engines
shared/backtest.ts                    return CSV, provenance, alignment and metrics
server/app-api.ts                     auth, state and optional AI REST endpoints
server/app-security.ts                validation, password/session and AI privacy
server/app-repository.ts              owner-scoped MySQL persistence
server/_core/                         Express entry, Vite/static serving, env, optional LLM client
server/safe-error.ts                  log-safe error summaries
scripts/with-node-env.mjs             cross-platform NODE_ENV launcher
shared/onboarding.ts                  profile validation and risk questionnaire
server/app-security.test.ts           password/state/privacy/rate-limit tests
server/app-api.http.test.ts           HTTP-level API tests (in-memory repository)
server/coach-ai.test.ts               Coach AI tests (stubbed provider)
server/safe-error.test.ts             log-safe error tests
server/platform.test.ts               unset-AI-endpoint test
shared/onboarding.test.ts             onboarding and questionnaire tests
shared/finance.test.ts                deterministic portfolio analytics tests
shared/backtest.test.ts               parser, metrics, cost and missing-data tests
drizzle/                              mapped database schema and migrations
docs/venture/                         sourced opportunity and research deliverables
ideas.md                              accepted navy/Harbor Blue design direction
TODO.md                               original and supplementary acceptance clauses
```

## Verification and handoff

Verification uses `pnpm check`, `pnpm test` and `pnpm build` (the latest recorded results are in `HANDOFF.md`) plus a local run (`pnpm dev`) for the manual checks. Exercise imported return data through the shared calculations and inspect the resulting API state contract without introducing factual or synthetic performance into the demo. The supplementary acceptance requires an end-to-end demonstration; use the supplied Vikram or Meghna synthetic *portfolio* journey for onboarding/dashboard/goals/stress and show that historical backtesting correctly remains empty until the user supplies a dataset. The independent read-only integration review of the full `TODO.md` has not been completed (see `TODO.md` section 13) and remains an open task; keep unverified criteria open and recheck affected behaviour after fixes. No publication or push has been performed; pushing to a repository requires the owner's explicit approval.
