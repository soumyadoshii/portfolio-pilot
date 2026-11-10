# PortfolioPilot venture research notes

Internal source log for the finished venture dossier and regulatory note. Accessed 2026-10-10. The dossier distinguishes published facts from unvalidated product/adoption hypotheses.

## [1] Government of India / Economic Survey 2025–26 market-participation summary

**Source:** Press Information Bureau, Ministry of Finance, “Amidst continuous shifts in trade policies and global uncertainties, India’s equity markets exhibited measured yet resilient performance: Economic Survey 2025–26,” posted 2026-01-29. URL: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2219998

**Read from the full PIB article in the browser.** Reported through December 2025: 235 lakh demat accounts were added during FY26 and the total exceeded 21.6 crore; the 12-crore milestone for unique investors was crossed in September 2025, with nearly one quarter women. Mutual funds had 5.9 crore unique investors at end-December 2025, while 3.5 crore non-tier-I/II-city investors are dated November 2025. The release also reports that equity and mutual funds reached over 15.2% of annual household financial savings in FY25, and average monthly SIP flows rose from under ₹4,000 crore in FY17 to over ₹28,000 crore in FY26 April–November.

**Interpretation/caveats:** Demat accounts are not unique people; PIB separately states unique-investor counts. Mutual-fund folios also are not unique people. Do not use market totals as a directly addressable paid-user count. These figures describe participation, not willingness to pay for an independent analytics product. Use the unique-investor estimate only as a broad audience ceiling and label adoption/monetization scenarios as assumptions.

## [2] AMFI March 2026 monthly note — direct PDF text verified

**Source:** Association of Mutual Funds in India, “AMFI monthly note — March 2026.” URL: https://www.amfiindia.com/uploads/AMFI_Monthly_Note_Mar_2026_1f0a1f5c48.pdf

The official 19-page PDF was opened in the browser and its public text was extracted locally for verification. It states that the industry added 33.63 lakh net folios in March 2026, taking the total to 27.39 crore, up 1.24% from 27.06 crore in February. These are **folios**, not unique investors; they cannot be added to the PIB unique-investor base as if they were people. The temporary downloaded public PDF/text copies were removed after extracting these aggregate facts.

## [3] RBI Account Aggregator Master Direction

**Source:** Reserve Bank of India, “Master Direction - Non-Banking Financial Company - Account Aggregator (Reserve Bank) Directions, 2016,” page states updates through 2024-09-06. URL: https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=10598

**Read from the full RBI page in the browser.** The Direction says customer services require explicit consent; the consent artefact identifies the financial information, purpose, recipient, creation/expiry and other prescribed details; customers must have a revocation function; artefacts are loggable/auditable/verifiable. It also says AAs must not support customer transactions, customer FI-provider credentials are not accessed, and FI obtained from providers must not reside with the AA. These rules are about the regulated AA operator, not a blanket claim about every downstream analytics app.

**Implication:** Keep this prototype manual/CSV-only. A future AA flow would require an appropriately authorized FIU/partner and a separate consent, security, retention and revocation design; never solicit brokerage credentials or infer that product code alone qualifies as an AA participant.

## [4] SEBI Investment Advisers Master Circular listing page

**Source:** Securities and Exchange Board of India, “Master Circular for Investment Advisers,” official page dated 2025-06-27. URL: https://www.sebi.gov.in/legal/master-circulars/jun-2025/master-circular-for-investment-advisers_94821.html

The official listing page confirms the title and date. Its linked circular text was not extracted by the available browser/text view. Treat this as a pointer to the applicable adviser framework, not a complete review of every obligation or any subsequent amendments. Product-side screening should preserve educational, user-entered assumption analysis, avoid individualized security-specific buy/sell/hold output, and obtain Indian securities counsel’s written boundary analysis before any commercial/personalized advice launch.

## [5] SEBI Research Analysts Regulations listing page

**Source:** Securities and Exchange Board of India, “Securities and Exchange Board of India (Research Analysts) Regulations, 2014 [Last amended on November 25, 2025],” official page dated 2025-11-25. URL: https://www.sebi.gov.in/legal/regulations/nov-2025/securities-and-exchange-board-of-india-research-analysts-regulations-2014-last-amended-on-november-25-2025-_98248.html

The official page confirms the regulation title/version date, but the regulation text itself was not extracted from the listing page. Do not state that a disclaimer or an “educational tool” label creates an exemption. Have securities counsel assess personalized research, security ranking and public recommendations against the live regulations/circulars before release.

## [6] Government of India summary of DPDP Rules 2025

**Source:** Press Information Bureau, Ministry of Electronics and Information Technology, “DPDP Rules, 2025 Notified,” posted 2025-11-17. URL: https://www.pib.gov.in/PressNoteDetails.aspx?NoteId=156054&ModuleId=3

**Read from the full PIB article.** It says the Rules were notified on 2025-11-14; the Rules use an 18-month phased implementation period; key principles include consent/transparency, purpose limitation, minimization, accuracy, storage limitation, safeguards and accountability. The article describes separate clear consent notices, breach notification, access/correction/erasure and a point of contact. It is a government explainer rather than the Act/Rules text. Legal counsel must verify which sections/deadlines are in force on the launch date and the product’s exact fiduciary/processor role.

## [7] INDmoney official portfolio tracker page

**Source:** INDmoney, “Track All Investments in One Place - Portfolio Tracker Tool.” URL: https://www.indmoney.com/features/track-all-investments

**Read from the first-party product page in the browser.** The page positions a broad tracker/net-worth view and lists Indian and US stocks, ETFs, mutual funds, IPOs, futures/options, commodities, NPS, savings accounts, credit cards, ESOPs, goals and portfolio scan/tracking features. This establishes a broad adjacent-product benchmark. It does not reveal actual accuracy, active use or willingness to pay.

## [8] Kuvera by CRED official site

**Source:** Kuvera by CRED, homepage. URL: https://kuvera.in/

**Read from the first-party website via text extraction** (browser rendering itself was blank). It presents tracking assets, curated mutual funds and paths to grow wealth, with long-term portfolio insights and reallocation language. The page discloses distinct entities for its adviser and stock-broker offerings. Treat those as separate regulated entities, not as a claim that one registration covers every product. This supports a competitive baseline for investment/wealth journeys, not an unserved-market claim.

## [9] ET Money official external-portfolio help page

**Source:** ET Money, “How can I track my existing portfolio?” URL: https://www.etmoney.com/help/mutual-funds/portfolio/how-can-i-track-my-existing-portfolio

**Read from the first-party help page in the browser.** It says external mutual-fund tracking requires a Genius Membership or Investing Essentials, then uses the profile’s “Track External Portfolio” flow, sends an OTP from MF Central, and fetches portfolio details in 4–5 minutes after successful OTP. This is one documented integration route; it does not imply that PortfolioPilot can or should access MF Central.

## [10] Securities Markets Code Bill status lead — not treated as enacted law

**Source:** PRS Legislative Research, “The Securities Markets Code, 2025,” bill summary. URL: https://prsindia.org/billtrack/the-securities-markets-code-2025

The PRS page says the Bill was introduced in Lok Sabha on 2025-12-18 and proposes consolidating/replacing the SEBI Act, Securities Contracts (Regulation) Act, and Depositories Act. The retrieved summary did not establish final passage, assent, commencement or current status as of 2026-10-10. Therefore this is a **status-unverified legislative watch item**, not a statement of law in force. Check the official Parliament/Gazette record and have counsel verify before any legal launch decision.

## [11] SEBI Investor Survey 2025 — excluded from opportunity claims

**Source:** Securities and Exchange Board of India, “Investor Survey 2025 Main Report.” URL: https://www.sebi.gov.in/sebi_data/commondocs/jan-2026/Investor%20Survey%202025%20Main%20Report.pdf

The official PDF URL timed out in the browser. Search snippets mentioned household participation/awareness figures, but the report and sampling definitions were not verified. **No figures from this survey are cited in the venture dossier.**
