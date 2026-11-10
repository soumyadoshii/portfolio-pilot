# PortfolioPilot regulatory, privacy and data boundaries

## Current product boundary

PortfolioPilot is an educational and analytical prototype. It accepts user-entered holdings and CSV files, stores account-scoped portfolio state, calculates deterministic scenarios, and can provide opt-in explanatory AI commentary. It does not connect to a brokerage, ask for broker credentials or OTPs, provide verified live prices, hold assets, route orders, move money or execute trades.

Its stress tests use explicit illustrative asset-bucket shocks. Its current portfolio and demo correlation inputs are identified as synthetic. Its historical backtest uses only monthly bucket returns uploaded by the user and remains labelled unverified. Goal results are deterministic projections, not probabilities. The fixed disclaimer appears across application views; it is not a regulatory safe harbor or a legal classification.

## Indian securities-law review required

SEBI’s official website lists a June 2025 **Master Circular for Investment Advisers** and a Research Analysts Regulations page identified as last amended on November 25, 2025.[1] [2] The public listing pages reviewed for this dossier confirm document titles and dates; the full operative text and every later circular were not extracted or reviewed here. Accordingly, this dossier does not determine whether the present prototype or any future distribution model falls within investment-adviser, research-analyst, distributor or other obligations.

Before public commercial launch, Indian securities counsel should review the actual user flows, security-level statements, model prompts, feature names, allocation comparisons, referral/affiliate arrangements, customer-specific outputs and business model against the rules then in force. A disclaimer, an “educational” label or the lack of trade execution must not be assumed to create an exemption. Keep the prototype’s review language descriptive and non-directive; do not issue individualized security-specific buy/sell/hold instructions or claim professional suitability assessment.

PRS Legislative Research lists the Securities Markets Code, 2025 as a bill introduced in Lok Sabha on December 18, 2025 and summarizes proposed consolidation of securities statutes.[6] The source log did not verify final passage, assent, commencement or current status as of October 10, 2026. Treat this only as a legislative watch item and verify official Parliament and Gazette records before relying on its status.

## Data protection and account security

The Ministry of Electronics and Information Technology’s November 2025 public announcement states that the Digital Personal Data Protection Rules, 2025 were notified on November 14, 2025, with an 18-month phased implementation period, and describes consent, purpose limitation, data minimization, accuracy, storage limitation, safeguards, accountability and user-rights concepts.[3] The announcement is a government explainer, not a product-specific legal opinion. Counsel must check the Act and Rules themselves, subsequent directions and the deadlines in force on the intended launch date, then determine PortfolioPilot’s role and obligations.

Prototype safeguards should continue to include:

- Collect only fields needed for account access, calculations and saved preferences. Never request a brokerage password, one-time password, card number or security credential.
- Keep account access private and owner-scoped. Use secure password hashing; store only hashed session tokens; use finite, secure HttpOnly session cookies (currently `SameSite=None; Partitioned`, a setting chosen for the original embedded hosted Preview and not reviewed for other deployments); rate-limit authentication and protect private responses from shared caching.
- Validate and bound portfolio-state and file sizes server-side. Parse user CSV in the browser, keep only normalized bucket returns and explicitly entered provenance, and never persist the source file itself.
- Expose separate AI Coach and report-commentary choices, both off by default. Confirm opt-in in saved account state, and in the request, before a server-side model request. When both are present and an AI endpoint is configured, the server sends that external endpoint a minimized numeric summary and computed return metrics (without names, email, identifiers, holding/security names, source URL or raw historical rows) and, for Coach only, **the user's free-text question exactly as typed** (up to 500 characters). The question is not filtered, so it can contain anything the user types. Report commentary sends the numeric summary only. The Coach checkbox is worded "for this question" although it stores a saved account preference that applies to later questions, and the consent labels do not yet name the external provider.
- Keep server logs free of user data. Database failures are logged as a category and driver code only (no SQL, bound parameters, email, name, password hash or token), and AI-call failures log only a status or timeout message; both are covered by automated tests. Other log sources have not been exhaustively audited.
- Provide user-facing export, history deletion and account deletion controls; explain what each action removes. Future release needs a reviewed retention schedule, access logging, incident response and tested deletion in backups/providers.

These are prototype controls, not evidence of certification, independent security testing or legal compliance.

## Account Aggregator and third-party access

The RBI Account Aggregator Master Direction describes explicit purpose-bound customer consent, revocation and auditable consent artefacts for regulated AA services. It states that AAs do not support customer transactions, do not access the customer’s financial-information-provider credentials and must not retain FI obtained from providers.[4] Those requirements apply to the regulated AA framework; they do not automatically decide every downstream analytics app’s role.

PortfolioPilot currently supports manual entry and CSV upload only. A future integration must not be implemented by collecting brokerage passwords or scraping logged-in accounts. An AA flow would need an appropriately authorized financial-information-user or other licensed partner, a precise purpose and data scope, consent receipt and revocation path, access/retention limits, security review and counsel’s view of each participant’s obligations. The names of providers such as CAMS, KFintech or MF Central are roadmap possibilities, not present integrations or endorsements.

## Provenance and market-data controls

For historical comparisons, the app records the user’s source label and optional HTTPS reference, date range, upload timestamp, INR currency, monthly frequency, return-basis selection, missing-data method and unverified status. It does not establish that a file came from the named source, that a series is total return, or that it is accurate. No price feed or synthetic market series is used in the backtest.

Demo holdings and synthetic correlations are separated from the user-uploaded historical dataset. Demo crisis scenarios are explicitly illustrative sensitivities, not observed portfolio performance. If the data is incomplete or lacks at least 12 complete monthly observations for a correlation pair, the affected metric is unavailable rather than imputed. Cost, taxes, slippage, corporate actions, delisted constituents and survival bias remain visible limitations.

A future provider connection requires separate data licensing, source manifests, retrieval timestamps, market calendars, adjustment/total-return definitions, point-in-time constituents, delisted securities, corporate-action handling, currency conversion and validation. Until those capabilities exist, do not label prices, returns, correlation, backtest outputs or external-account states as verified or live.

## AI explanation controls

The AI feature is optional and is called server-side only. It is enabled only when `MANUS_API_URL` and `MANUS_API_KEY` are set; those names are historical, and the code calls an OpenAI-style HTTP API at the configured URL (it was written for the Manus-hosted endpoint). **No real provider has been tested**, and no provider's retention, training or regional-processing terms have been reviewed. The app uses an explicit saved consent for each AI feature plus a per-request consent flag. If consent is absent, no endpoint is configured, or the provider is unavailable, slow or returns an unusable reply, the deterministic explanation is returned instead. Outbound calls are time-bounded (15 seconds for the answer; 4 seconds per model-discovery attempt with one retry), and after a failure AI is paused for 60 seconds. AI is instructed to explain only minimized, server-derived facts and not invent holdings or compute its own future return, but the Coach question is the user's own text and is sent unfiltered. Treat any model text as commentary, not as a source of financial facts. Do not use user financial details to train a model, and do not state a provider's retention terms without verified provider documentation.

A future release must document model/vendor processing, regional data path, retention/deletion, safety evaluation, adverse-output escalation, prompt-injection treatment and consent withdrawal before enabling the feature for production users.

## Launch gates

Before any commercial launch, obtain a written Indian legal analysis of SEBI classification and DPDP duties; verify the law and commencement dates then current; commission a security review; test session, export and deletion paths; document data retention and AI processing; validate all financial formulas independently; secure applicable data rights; and complete structured customer discovery. Any AA, broker, data-vendor or paid-advice partnership is a new scope and should be reviewed before it is represented in the product.

## References

[1]: https://www.sebi.gov.in/legal/master-circulars/jun-2025/master-circular-for-investment-advisers_94821.html "SEBI, Master Circular for Investment Advisers listing, 2025-06-27"
[2]: https://www.sebi.gov.in/legal/regulations/nov-2025/securities-and-exchange-board-of-india-research-analysts-regulations-2014-last-amended-on-november-25-2025-_98248.html "SEBI Research Analysts Regulations listing, last amended 2025-11-25"
[3]: https://www.pib.gov.in/PressNoteDetails.aspx?NoteId=156054&ModuleId=3 "PIB, DPDP Rules, 2025 Notified, 2025-11-17"
[4]: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10598 "RBI Master Direction – NBFC Account Aggregator, 2016, updated through 2024-09-06"
[5]: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2219998 "PIB, Economic Survey 2025–26 market-participation summary, 2026-01-29"
[6]: https://prsindia.org/billtrack/the-securities-markets-code-2025 "PRS Legislative Research, Securities Markets Code, 2025 bill summary"
