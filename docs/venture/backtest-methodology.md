# PortfolioPilot historical-comparison methodology

## Scope and evidence boundary

The `/backtest` page compares a user-defined baseline allocation with an editable **All-Weather-inspired** allocation. It is available only after the user imports a monthly asset-bucket return CSV. The application contains no bundled historical market series and does not fetch live or licensed prices. Therefore, every calculation is labeled **user-uploaded and unverified**. A user-supplied source name or URL is metadata, not independent verification.

The chart begins at a value index of 100, not a rupee account balance. The engine is a deterministic allocation-level simulation. It does not represent the exact holdings, historical members, or performance of a named investor’s strategy. Demo portfolio positions, synthetic demo correlations and editable crisis-scenario shocks are separate from this historical module and are never inserted into its data series.

## Data contract and provenance

Import a wide CSV with one row per month, a period column named `month`, `date`, `period`, `return month` or `month end`, and any supported bucket columns:

- Equity aliases include `equity`, `stocks`, `shares`, `Nifty` and `direct equity`.
- Mutual-fund aliases include `mutual funds`, `mutual fund`, `MF` and `funds`.
- Gold aliases include `gold`, `gold ETF` and `commodity`.
- Debt aliases include `debt`, `bonds` and `fixed income`.
- Cash aliases include `cash` and `cash equivalents`.

Returns are monthly simple returns in **percentage points**: `1.2` means `1.2%`, stored internally as `0.012`. A blank cell or absent column remains missing; it is not converted into zero. The CSV parser accepts monthly `YYYY-MM` and valid ISO `YYYY-MM-DD` dates, rejects duplicate or invalid periods, accepts at most 360 months and 1 MB, and bounds each monthly return to greater than −100% and at most +500%. The file is parsed in the browser and is not retained. Only normalized bucket rows and user-entered provenance are persisted in the existing validated portfolio-state record.

The saved provenance comprises source type (`user-uploaded`), a user-entered source name and optional HTTPS reference, upload timestamp, date range, INR currency, monthly frequency, the user-selected return-basis label, and the missing-data policy. The user must choose whether the series is total-return, price-only or unknown; the UI does not verify that choice. Source status remains `unverified`. The product records incomplete, unverified and excluded market-data claims instead of substituting synthetic observations.

A result is blocked when any asset bucket with a non-zero weight in either strategy has an incomplete observation inside the selected period. Incomplete leading or trailing months may shorten the usable common period. Internal gaps remain visible and stop the comparison. No zero-fill, interpolation, forward-fill, favorable-window selection or synthetic backfill is performed. A missing bucket can be excluded only by explicitly assigning that bucket a zero weight in both strategies.

## Strategy and cost rules

The user edits baseline and All-Weather-inspired weights. Each set must sum to 100% within 0.05 percentage points. When current holdings exist, their bucket weights are the suggested baseline; otherwise equal weights are a clearly labeled UI placeholder. The illustrative comparator defaults to Equity 30%, Mutual Funds 20%, Gold 15%, Debt 30% and Cash 5%. The default is not a universal recommendation.

Both strategies use the same uploaded observations, INR currency, common continuous period, return-basis label, annual risk-free assumption, rebalancing cadence and transaction-cost rule. Starting weights are in force before the first monthly bucket returns are applied. At a scheduled later rebalance, turnover is:

`one-way turnover = 0.5 × Σ |target weight − pre-rebalance weight|`

A flat user-editable basis-point cost is charged on this traded notional and applied consistently to each strategy. The default 10 bps is a modeling placeholder, not a brokerage fee estimate. Entry/setup costs, taxes, slippage, bid–ask spread, liquidity, market impact and security-level trading constraints are excluded. Between rebalances, weights drift according to each bucket’s observed return.

## Metrics

Let `r_t` denote the monthly net portfolio return after modeled periodic rebalancing cost. The simulated wealth index starts at 100 and compounds monthly.

- **Total return:** `Π(1 + r_t) − 1` over the chosen window.
- **CAGR:** `(V_end/V_start)^(365/calendar_days) − 1`, with both endpoint days included in the calendar span from the first month’s start through the last month’s end. A window shorter than 12 observations is marked `short-window`; it is still an arithmetic result, not evidence of long-run performance.
- **Annualized volatility:** sample standard deviation of monthly net returns multiplied by `√12`. Fewer than two returns makes it unavailable.
- **Sharpe ratio:** mean monthly excess net return divided by the sample standard deviation of monthly excess net returns, multiplied by `√12`. The annual INR risk-free assumption is converted to a compounded monthly rate: `(1 + annual rate)^(1/12) − 1`. A zero excess-return standard deviation yields unavailable, never infinity.
- **Maximum drawdown:** minimum `wealth / running peak − 1`, reported as a negative percentage. Its peak and trough are measured at monthly resolution.
- **Recovery period:** calendar months from the maximum-drawdown trough to the first subsequent month that recovers that drawdown’s prior peak. If the supplied window never recovers the peak, the UI says **Not recovered in sample**; if no drawdown occurred, it says **No drawdown observed**.
- **Selected-period returns:** total return and CAGR are shown only for a full 1-, 3-, 5- or 10-year monthly window; otherwise the period is unavailable. The full selected window is also shown.
- **Stress-event windows:** the engine attempts continuous monthly proxies for 2008-01–2009-03, 2013-05–2013-09, 2020-02–2020-04 and 2022-01–2022-10. An event is available only if every month is present; unavailable does not mean zero. Monthly sampling cannot resolve an intramonth drawdown.

Each metric contains a value, unit, status, method, window, observation count, annualization factor and input summary. The result also carries the provenance and assumptions used for both strategies.

## Correlation and concentration

For a user workspace, bucket correlations use pairwise-complete monthly observations from that workspace’s uploaded return file. Pearson correlation is displayed only when at least 12 paired observations exist for that pair and both series have non-zero sample standard deviation. Each cell includes its observation count. Correlation describes this unverified sample; it does not predict future co-movement. No synthetic matrix is substituted when a user series is absent or too short. Synthetic matrices are explicitly limited to the demo portfolio.

Security and sector concentration use value weights. For normalized weights `w_i`, HHI is `Σ w_i²`, displayed on both a 0–1 and 0–10,000 scale. Effective holdings are `1/HHI` when the denominator is positive. HHI is a descriptive concentration statistic, not a standalone risk probability or regulator-issued rating. The diversification score’s correlation weight scales with the fraction of measurable off-diagonal pairs; its coverage percentage reports the methodology weight represented in the calculation.

## Goal projection boundary

Goal projections elsewhere in the app are deterministic, not backtest-derived probabilities. They use monthly compounding and an ordinary-annuity convention in which contributions occur at month end, inflation-adjust the target over the remaining months, and show assumptions. If the target date has arrived and a new required contribution cannot be estimated, the UI reports unavailable instead of zero or a fabricated probability. There is no Monte Carlo probability model in the MVP.

## Interpretation and limitations

Asset-bucket monthly history is not security-level point-in-time evidence. It cannot establish historical index/fund constituents, delistings, market closures, survivorship-free coverage, corporate actions, dividend completeness, price-return versus total-return correctness, financing, trading liquidity or executable fills. A monthly asset-class series is not a representation of an investable security or a forecast. Results may be wrong if the input is wrong. There is no external source verification, licensed market-data integration, tax model or out-of-sample optimizer in this prototype.

No performance figure should be described as expected future return, an investment recommendation, a guaranteed result or evidence that the All-Weather-inspired comparison is superior. Any commercial performance claim requires validated point-in-time data, independent calculation review, data licensing and legal/compliance review.
