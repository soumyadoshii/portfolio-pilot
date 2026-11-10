# PortfolioPilot rebuild acceptance ToDo

This list tracks product outcomes from the attached PortfolioPilot specification and approved implementation plan. Keep criteria intact when updating status; do not mark an item complete without evidence.

> **Status note (2026-10-11):** sections 1 to 12 are the original acceptance clauses. A few of them named the original hosted platform or tRPC; those words were corrected where marked, and no completion status was changed. Sections 11 and 13 are dated records from the original hosted build. Current automated results and the open-item list are in section 14 and in `HANDOFF.md`.

## 1. Public landing, navigation and trust
- Landing hero uses “Your Portfolio. Your Goals. Your All-Weather Strategy.” and explains the product; provide working Analyze My Portfolio and Explore Demo actions, sample value/goal/diversification/risk/allocation preview, problem explanation, Goal Mapping, Stress Testing, Diversification Health and All-Weather Rebalancing cards, how-it-works, AI coach example, privacy/non-trading statement and persistent disclaimer.
- Main app routes cover landing, account/demo onboarding, dashboard, portfolio overview/holdings/allocation/sectors/diversification/risk, stress test, goals/list/detail, all-weather/rebalance, AI Coach, reports, notifications, settings/profile/privacy/security and help. Navigation does not lead to dead ends.
- Use the persistent disclaimer: “PortfolioPilot is an educational and analytical prototype. Simulations and recommendations are illustrative and do not constitute personalized investment advice or a guarantee of future returns.” Clearly prohibit/avoid trading, money transfer, unsupported live account connections, guaranteed returns, exact price predictions and claims of regulatory approval.

## 2. Authentication, onboarding and demo entry
- Keep guest demo usable without brokerage credentials; clearly label synthetic values “Demo Data”/“Demo Portfolio”. Offer separate account sign-in/registration and distinguish local guest, sample and saved account data. Do not simulate a signed-in user.
- Demo contains two fictional personas: Vikram Nair (31, Pune software engineer, ₹14L/year, ₹25k monthly investment, Moderate, ₹3cr early-retirement goal by 50) and Meghna Sharma (38, Mumbai school principal, daughter’s education ₹20L in 10 years and retirement ₹80L in 22 years, with sample ELSS/PPF/stocks/insurance-linked investments).
- Onboarding captures age/employment/income/monthly investment/experience/holdings and an 8–10-question risk questionnaire. Return only a “Portfolio Risk Profile” of Conservative/Moderate/Growth/Aggressive, never a professional assessment.

## 3. Portfolio, imports and analytics
- Provide at least 20 fictional Indian holdings including HDFC Bank, Reliance, Infosys, TCS, ICICI Bank, L&T, mutual funds, gold ETF and debt; seed at least five goals, six scenarios, snapshots, illustrative correlations, sample reports and in-app notices without overwriting user edits.
- Holdings table supports search/filter/sort and shows asset type, sector, quantity, average price, current value, gain/loss and allocation. Include asset-class/sector/security/market-cap/geography analysis, largest sector/class, top 1/3/5 security weights and equity concentration with neutral explanatory warnings.
- CSV import accepts flexible aliases, including symbol/ticker/stock/security/instrument and current value/market value/value/amount; validate file type/size and rows, normalize to the common holding schema, show actionable errors/import counts and update current state.
- Diversification health is an explained normalized 0–100 score using asset-class 30%, sector 20%, security concentration 20%, correlation 20%, geography 10% where available; state that it is not an official rating. Show clearly labeled synthetic demo correlation data and a visible -1 to +1 correlation matrix.
- Dashboard displays portfolio value/gains, diversification score, risk profile, goal progress, allocation donut, value history, goal cards, concentration/risk/goal-alignment summaries, stress snapshot and contextual insight. Charts have labels/legends/tooltips/responsive sizes and accessible equivalents.

## 4. Goals and projections
- Support multiple goal create/edit/delete/detail flows with name/category, target/current amount, target date, monthly contribution, expected return and inflation assumptions; show assumptions.
- Calculate time remaining, inflation-aware target where appropriate, progress, illustrative projected corpus, required monthly SIP/contribution, shortfall/surplus, likelihood indicator and On Track / Needs Attention / Behind based on explicit thresholds. Show an illustrative chart comparing current/expected/required trajectories with the target.

## 5. Stress test and all-weather analysis
- Provide 2008-style equity crisis, COVID-style shock, 2013 taper tantrum, inflation shock, interest-rate shock, equity correction and editable custom shocks, each with visible illustrative per-asset-class assumptions.
- Calculate current and after-shock values, estimated portfolio loss/drawdown, per-holding impacts, largest loss contributors, recovery estimate/simulation and before/after goal impacts from holdings × selected assumptions; scenario editing changes results. Retain the exact custom scenario name and disclose all calculations are illustrative.
- All-weather analysis uses growth, inflation, deflation and recession/slowdown regimes; show growth-, inflation-, deflation-sensitive and defensive exposures, and compare current with an illustrative balanced allocation. Label it “All-Weather-inspired scenario framework”; do not imply an exact or guaranteed named-investor portfolio.

## 6. Allocation/rebalance review
- Allow user-edited asset-class targets and percentage-point drift tolerances. Show current/target/drift, whether each class is outside its tolerance, and illustrative currency adjustments; explain the change, why, risk addressed, goal supported and assumptions.
- Label actions “Review adjustment”; never execute a trade. Disclose that tax, transaction costs and security-level constraints are excluded. Empty holdings show an actionable setup state instead of a fabricated review.

## 7. Portfolio Coach and privacy
- Answer questions using the active state and deterministic engines; never invent holdings or rely on browser-supplied facts for an authenticated account. Explain assumptions, calculations, uncertainty and context in plain English. Include prompts for diversification, sector exposure, goal progress, a 20% shock, gold, monthly investment and portfolio changes.
- Signed-in users must explicitly opt in before account-derived context/question is sent to the configured external AI endpoint; minimize server-derived context and omit names, email, identifiers and holding/security names. Guest/demo coach stays local and deterministic. When AI is disabled/unavailable, retain a truthful deterministic fallback. Never expose provider keys in browser code. *(Updated 2026-10-11: the Coach question itself is sent exactly as typed and is not filtered, and no real provider has been tested; see `README.md`.)*

## 8. Reports, notifications and settings
- Generate/save a concise professional report with “Where You Are”, “Where You Need To Be”, “What Changed”, “One Thing To Consider” and “Stress Snapshot”, covering value/returns/allocation/risk/diversification/goals/contributions/stress/rebalance, assumptions and disclaimer. AI commentary appears only after separate explicit opt-in; otherwise identify the deterministic note. Support print/save-to-PDF and Markdown download.
- In-app notices cover goal progress, drift, concentration, report availability, stress completion and rebalance thresholds; no SMS/email delivery is required.
- Settings include profile (including employment, income, experience, age, risk profile), INR, notification/report preferences, data export/deletion, password change and active-session controls. Confirm irreversible account deletion; protect account data and session operations.

## 9. Persistence, security and engineering
- Use the React/TypeScript/Vite + Express + Drizzle/MySQL stack (REST under `/api/app`; the tRPC server named in the original wording has been removed); persist saved-user portfolio state in the configured MySQL database with per-user authorization, validated input and safe migrations. Guest/demo data stays in browser state. No broker, market-price, trade, payment or external provider dependency is required.
- Keep modular deterministic Goal, Risk, Diversification, Stress, Allocation, Correlation, Rebalance, Projection, Report and explanation logic. Test future-value/SIP, score normalization, scenario loss/goal impact, allocation/rebalance tolerance, CSV parsing, password hashing/session boundaries and API JSON shapes.
- Provide robust empty/loading/error/success states, upload limits, no-store private API behavior, environment-managed secrets and API-not-found handling. Accessibility includes labels, keyboard operation, focus, contrast and no color-only signaling; layouts work on desktop/tablet/mobile.

## 10. Documentation and delivery
- README covers overview, architecture, features, modules, setup, database setup/migrations/demo fixtures, demo access, CSV schema, optional AI/consent, tests, deployment, limitations and future broker/data-provider adapters.
- Before delivery, complete the one required read-only integration review for this Plan Mode project, resolve confirmed defects and report any unresolved requirement honestly. Save the verified version as a checkpoint (originally a hosted-platform WebDev checkpoint; now local checkpoint folders and, once the owner approves, a private repository); do not publish or push unless explicitly requested.

## 11. Final integration review record — 2026-10-10

*Historical record from the original hosted build. References below to the HTTPS Preview, the route manifest, `/api/platform/config.js` (since removed), the 22-test suite and the disposable Preview journey describe that environment and are not current results; see section 14 and `HANDOFF.md`.*

The required read-only integration review completed. Its confirmed defects were addressed in source; the original acceptance clauses above remain unchanged and are not globally marked complete.

### Findings fixed (IDs are section/bullet positions above)
- **2.1 / 9.1 — Account-to-demo session boundary:** `enterDemo` now waits for pending account saves, persists the latest state, revokes the account cookie before replacing it with local demo state, and prevents a late initial-session response from restoring the account UI. The UI navigates only after success. API logout/re-login and account cleanup passed; the actual CTA click/reload sequence remains unverified in a browser.
- **7.1 / 7.2 — Coach monthly-investment and change prompts:** deterministic answers now use the active profile and saved snapshots, explicitly decline to invent an incremental amount, and describe only recorded snapshot deltas. The opt-in AI context now carries numeric contribution/snapshot aggregates only; privacy tests confirm snapshot labels and identity/security text are excluded.
- **1.2 / 3.4 — Empty dashboard CSV action:** “Import a CSV in Portfolio” now links to the portfolio import view instead of being a no-op. The route/action is verified by source and type checks; a browser click was not exercised.
- **5.2 / 8.2 — Stress result freshness:** saved results are displayed only when the active scenario, assumptions, holdings and goal impacts still match; selecting/changing inputs can no longer display a different recomputed scenario as the saved run. The UI scenario-switch interaction remains unverified in a browser.
- **4.1 — Goal fields:** creation now captures current saved amount, target date, monthly contribution, return and inflation assumptions; goal detail permits name/category and numeric assumption edits. Added Home Purchase, Child Education, Emergency Fund, Vehicle, Wealth Creation and Custom Goal categories while retaining existing demo categories. Type/state-schema checks pass; browser CRUD interaction remains unverified.
- **8.1 — Report coverage:** deterministic reports now include cost-basis gain/loss, risk profile, profile and goal monthly contributions, saved snapshot change, required goal contributions, and an allocation/rebalance review. Added a unit assertion for these sections; print/download interaction remains unverified.
- **6.1 / 6.2 — Rebalance rationale:** each bucket now explains the proposed review direction/value, tolerance trigger, risk lens, nearest-goal context and calculation exclusions; it remains review-only and does not trade. The rendered table was not browser-exercised.

### Validation evidence
- `pnpm check` — passed.
- `pnpm test` — passed, 4 test files / 22 tests.
- `pnpm build` — passed. Vite emitted a non-fatal large-chunk warning (main JS about 861 kB / 242 kB gzip) and the expected platform config-script bundling notice.
- Local and HTTPS Preview `/api/health` returned 200; landing route and the 15-entry route manifest returned 200 with the required `{ routes: [{ path, title }] }` shape.
- Disposable HTTPS API journey passed: registration and empty persisted state; HttpOnly/Secure/SameSite=None/Partitioned cookie; persisted 22 holdings and 5 goals; numeric goal/stress analytics; no-consent deterministic Coach; opted-in Coach and report commentary returned `source: "ai"`; deterministic monthly/change prompts returned saved-state answers; logout revoked the session; login still worked; disposable account was deleted.

### Keep open / not independently demonstrated
- The acceptance criteria remain open for end-to-end browser-level interaction of the guest demo → register/login → onboarding → dashboard journey, goal CRUD, CSV file selection/import, scenario switching/custom edits, rebalance target/tolerance edits, and report print/Markdown download. API, source and unit evidence above is narrower than browser behavior.
- Responsive rendering, keyboard/focus/contrast/accessibility, chart tooltips/legends, and printed/PDF layout were not visually inspected; no browser or screenshot session was used.
- Password change, active-session listing/revocation, and account-deletion UI confirmation were not exercised in this runtime pass.
- The implementation review and available automated evidence do not independently establish every original UI acceptance clause; do not represent the full ToDo as complete solely on this record.

## 12. Supplementary acceptance criteria — quantitative research and venture documentation

### 12.1 Quantitative Portfolio Research
- Implement a quantitative analytics and backtesting module that can compare a user-defined baseline portfolio with an all-weather-inspired strategy.
- Where reliable historical data is available, calculate:
  - CAGR
  - Annualized volatility
  - Sharpe ratio, with the risk-free rate assumption documented
  - Maximum drawdown
  - Recovery period
  - Portfolio returns over selected periods
  - Performance during major market stress periods
- Use a common historical period and consistent assumptions for strategy comparisons. Account for missing observations, rebalancing frequency, transaction-cost assumptions and survivorship/data limitations where relevant. Clearly distinguish historical results from future projections.

### 12.2 Statistical Diversification
- Add a documented concentration calculation using the Herfindahl-Hirschman Index or an equivalent concentration measure. Include portfolio weights, sector concentration and correlation-based risk analysis where data supports them.
- Do not invent correlations or historical returns. If synthetic data is used, label it explicitly and prevent synthetic results from being presented as empirical evidence.

### 12.3 Goal Projection and Probability
- Implement goal calculations with documented compounding conventions, inflation assumptions, contribution timing and time horizons.
- If goal probability is displayed, implement a reproducible Monte Carlo or other documented probabilistic model using explicit assumptions. If insufficient data is available, display a deterministic projection instead of a fabricated probability.

### 12.4 Financial Calculation Validation
- Create automated unit tests for all financial formulas and analytics engines. Include zero contributions, zero returns, negative returns, missing holdings, extreme values, short goal horizons and rounding boundaries.
- Ensure the dashboard, report, AI Coach and backend use the same calculated results.

### 12.5 Data Provenance
- Create a data-source layer that records the source, date range, update timestamp, currency, missing-data treatment and whether data is real, user-uploaded or synthetic.
- Do not claim live prices, real brokerage connectivity or historical accuracy without verification.

### 12.6 Complete Entrepreneurship Deliverables
Maintain a separate project documentation area containing:
- Opportunity identification and problem statement
- Problem validation and research methodology
- Stakeholder analysis
- User personas
- Entrepreneurial ecosystem mapping
- Competitor analysis
- Regulatory and compliance considerations
- Business model and revenue model
- Market opportunity assumptions
- Concept note and elevator pitch
- MVP scope, limitations and future roadmap

Preserve the original PortfolioPilot report's framing and terminology. Clearly label any new estimates or research that have not been independently validated.

### 12.7 Final Verification
- Before declaring completion, demonstrate the full end-to-end application using demo data, verify the core calculations with automated tests, document all incomplete integrations and provide a clear distinction between implemented functionality, simulated functionality and future enhancements.
- Do not merely create static screens. Build, run, test and fix the actual application.

## 13. Final supplementary verification status — 2026-10-11

*Historical record from the original hosted build. The 38-test count was the suite at that time; the suite is now 115 tests in 8 files (section 14). References to the HTTPS Preview, `/manus-routes.json` and `git diff --check` describe the original hosted environment.*

- **Automated calculations and contracts:** `pnpm check` passed; `pnpm test` passed 38/38 tests across 5 files, including historical CSV normalization, common-window gaps, period/event availability, return metrics, rebalancing costs, correlations, deterministic goal boundaries, HHI, backend provenance limits, and identical shared historical results in reports/Coach.
- **Live persistence/contract evidence:** the disposable HTTPS Preview check saved 12 monthly user-uploaded observations and comparison settings through `/api/app/state`, reloaded them, and confirmed the actual frontend `isPortfolioState` accepted registration, save and GET responses. The no-consent Coach produced the deterministic answer from the shared stored-history calculation. The disposable account was deleted.
- **Preview/build:** the previously verified `pnpm build` succeeded. At final check, `/api/health`, `/`, `/backtest` and `/manus-routes.json` returned 200; route manifest is synchronized. `git diff --check` passed.
- **Venture documents:** README links to four complete files under `docs/venture/`; opportunity, market assumptions, user/stakeholder personas, ecosystem, competitor context, revenue hypotheses, regulatory/data boundaries, research methods, limitations and roadmap are recorded with dated source notes and unvalidated-claim caveats.
- **Independent review:** a read-only validator was started against the complete plan and ToDo, but the review job stopped after reading the plan, ToDo and repository layout and did not return findings. No independent validator pass is claimed; the full end-to-end integration-review criterion remains open.
- **Browser demonstration remains open:** the supplied evidence is automatic tests, source review and API/runtime responses. It does not demonstrate actual browser interactions, responsive/accessibility rendering or the complete guest-demo → registration/onboarding → dashboard → goal/stress/backtest journey. Do not mark section 12.7, or the affected original visual/UI criteria, complete on this evidence alone.

## 14. Status after the Manus-infrastructure cleanup — 2026-10-11

No acceptance criterion above is newly marked complete by this section. It records only what has been verified since section 13.

- **Automated:** at the last recorded run (Windows, Node 24.13, `DATABASE_URL` pointed at an unreachable placeholder), `pnpm check` exited 0, `pnpm test` passed 115 of 115 tests in 8 files, and `pnpm build` exited 0 (details in `HANDOFF.md`). The HTTP-level API tests use an in-memory repository, and the Coach AI tests use a stubbed provider, so neither exercises MySQL or a real AI provider.
- **Owner-reported manual check (not independently verified):** with the existing migrations applied to a local MySQL database, registration, sign-in, reload persistence, sign-out and re-sign-in worked in Chrome. The Portfolio, Stress test, Backtest, All-weather, Coach and Reports pages were reported to render; Backtest explained that demo holdings carry no historical returns, and Coach indicated that demo answers run locally. Not covered: responsive and accessibility checks, chart tooltips, goal create/edit/delete, CSV import, scenario edits, print and Markdown download, password change, session revocation and account deletion in the UI.
- **Still open:** the browser-level criteria listed under section 11 ("Keep open"), as narrowed above; the independent read-only integration review; Coach and report AI against a real provider; Node 22 and non-Chrome browsers.
- **Removed from scope of the codebase:** the tRPC server, the OAuth/SDK code, the public-config script and the unused hosted-platform helpers. Acceptance wording that named them is corrected or marked historical above.
