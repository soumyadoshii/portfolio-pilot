import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useApp } from "./contexts/AppContext";
import { ReportDownload } from "@/components/ReportDownload";
import {
  defaultBacktestConfig,
  parseHistoricalReturnsCSV,
  RETURN_MISSING_POLICY,
  runHistoricalComparison,
  type BacktestMetric,
  type BacktestResult,
} from "@shared/backtest";
import {
  ASSET_BUCKETS,
  type BacktestConfig,
  type HistoricalReturnBasis,
  type HistoricalReturnDataset,
} from "@shared/portfolio";

const percent = (value: number | null) =>
  value === null || !Number.isFinite(value) ? "Unavailable" : `${value.toFixed(2)}%`;
const BASIS_LABEL: Record<HistoricalReturnBasis, string> = {
  "total-return": "Total return (user-selected; unverified)",
  "price-only": "Price-only (dividends excluded)",
  unknown: "Unknown / not confirmed",
};

function MetricCard({
  title,
  baseline,
  allWeather,
  unit = "percent",
}: {
  title: string;
  baseline: BacktestMetric;
  allWeather: BacktestMetric;
  unit?: BacktestMetric["unit"];
}) {
  const show = (metric: BacktestMetric) => {
    if (metric.status === "not-recovered") return "Not recovered in sample";
    if (metric.status === "no-drawdown") return "No drawdown observed";
    if (metric.value === null) return "Unavailable";
    if (unit === "percent") return percent(metric.value);
    if (unit === "months") return `${metric.value} months`;
    return metric.value.toFixed(2);
  };
  return (
    <section className="card kpi backtest-metric" aria-label={title}>
      <div className="kpi-top">{title}</div>
      <dl>
        <div>
          <dt>Baseline</dt>
          <dd>{show(baseline)}</dd>
        </div>
        <div>
          <dt>All-Weather-inspired</dt>
          <dd>{show(allWeather)}</dd>
        </div>
      </dl>
      <small>
        {baseline.nObs} monthly observations · same comparison window
        {baseline.status === "short-window" ? " · short window" : ""}
      </small>
    </section>
  );
}

function ComparisonResults({ result }: { result: BacktestResult }) {
  if (result.status !== "ready" || !result.baseline || !result.allWeather)
    return (
      <section className="card" role="status">
        <span className="eyebrow">INPUT CHECK</span>
        <h2>No performance result calculated</h2>
        <p>{result.message}</p>
        {result.source.missingMonths.length > 0 && (
          <p className="error-box">
            Missing complete months: {result.source.missingMonths.join(", ")}
          </p>
        )}
        <p className="note">
          No gap was filled, interpolated or replaced with a synthetic return.
        </p>
      </section>
    );

  const baseline = result.baseline,
    allWeather = result.allWeather,
    allWeatherByMonth = new Map(
      allWeather.cumulativeSeries.map(point => [point.month, point.valueIndex])
    ),
    chartData = [
      { month: "Start", baseline: 100, allWeather: 100 },
      ...baseline.cumulativeSeries.map(point => ({
        month: point.month,
        baseline: point.valueIndex,
        allWeather: allWeatherByMonth.get(point.month) ?? null,
      })),
    ];
  return (
    <>
      <div className="kpi-grid compact backtest-kpis">
        <MetricCard title="CAGR" baseline={baseline.metrics.cagr} allWeather={allWeather.metrics.cagr} />
        <MetricCard title="Annualized volatility" baseline={baseline.metrics.annualizedVolatility} allWeather={allWeather.metrics.annualizedVolatility} />
        <MetricCard title="Sharpe ratio" baseline={baseline.metrics.sharpeRatio} allWeather={allWeather.metrics.sharpeRatio} unit="ratio" />
        <MetricCard title="Maximum drawdown" baseline={baseline.metrics.maximumDrawdown} allWeather={allWeather.metrics.maximumDrawdown} />
        <MetricCard title="Recovery from max drawdown" baseline={baseline.metrics.recoveryPeriod} allWeather={allWeather.metrics.recoveryPeriod} unit="months" />
        <MetricCard title="Total return" baseline={baseline.metrics.totalReturn} allWeather={allWeather.metrics.totalReturn} />
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">USER-UPLOADED HISTORY · UNVERIFIED</span>
            <h2>Indexed monthly portfolio value</h2>
            <p>Both lines begin at 100; the chart is derived from your imported monthly asset-bucket returns.</p>
          </div>
        </div>
        <div className="chart-wrap backtest-chart" aria-label="Indexed portfolio comparison chart">
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" minTickGap={28} />
              <YAxis domain={["auto", "auto"]} />
              <Tooltip formatter={(value: unknown) => [Number(value).toFixed(2), "Value index"]} />
              <Legend />
              <Area type="monotone" dataKey="baseline" name="Baseline" stroke="#315f85" fill="#dce8f0" fillOpacity={0.8} />
              <Area type="monotone" dataKey="allWeather" name="All-Weather-inspired" stroke="#4f857d" fill="#dcece7" fillOpacity={0.4} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="chart-caption">Indexed to 100 at the start of the common window. No absolute currency balance is inferred.</p>
        </div>
      </section>
      <div className="dashboard-grid backtest-tables">
        <section className="card">
          <span className="eyebrow">SELECTED HISTORY</span>
          <h2>Period returns</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Period</th><th>Baseline total</th><th>All-Weather total</th></tr>
              </thead>
              <tbody>
                {baseline.periodReturns.map((period, index) => {
                  const comparison = allWeather.periodReturns[index]!;
                  return (
                    <tr key={period.label}>
                      <th>{period.label}</th>
                      <td>{percent(period.totalReturnPct)}</td>
                      <td>{percent(comparison.totalReturnPct)}</td>
                    </tr>
                  );
                })}
                <tr>
                  <th>Selected window ({result.source.nObs} months)</th>
                  <td>{percent(baseline.metrics.totalReturn.value)}</td>
                  <td>{percent(allWeather.metrics.totalReturn.value)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section className="card">
          <span className="eyebrow">EVENT WINDOWS</span>
          <h2>Stress-period performance</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr><th>Window</th><th>Baseline</th><th>All-Weather</th></tr>
              </thead>
              <tbody>
                {baseline.stressPeriods.map((period, index) => {
                  const comparison = allWeather.stressPeriods[index]!;
                  return (
                    <tr key={period.id}>
                      <th>{period.label}<small>{period.startMonth} to {period.endMonth}</small></th>
                      <td>{percent(period.totalReturnPct)}</td>
                      <td>{percent(comparison.totalReturnPct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="note">An unavailable event window means the uploaded series does not contain that full continuous period; it is not a zero return.</p>
        </section>
      </div>
      <section className="card methodology">
        <span className="eyebrow">CALCULATION NOTES</span>
        <h2>One window, visible assumptions</h2>
        <p>
          {result.source.commonStartMonth} to {result.source.commonEndMonth} · {result.source.nObs} complete monthly observations · {result.source.currency} · {BASIS_LABEL[result.source.returnBasis as HistoricalReturnBasis]} · uploaded {new Date(result.source.uploadedAt).toLocaleString()}.
        </p>
        <p>
          Annual risk-free assumption: {result.assumptions.riskFreeAnnualPct}% · rebalancing: {result.assumptions.rebalanceFrequency} · flat cost: {result.assumptions.transactionCostBps} bps on one-way turnover. Baseline and comparison use identical dates, frequency, risk-free rate and cost rules.
        </p>
        <p>
          CAGR is calendar-day annualized; volatility is sample monthly standard deviation × √12; Sharpe uses compounded monthly risk-free returns and sample excess-return deviation; maximum drawdown is from a running peak; recovery ends at the first recovery of the maximum-drawdown peak. If the peak is not recovered in the sample, that is stated explicitly.
        </p>
        <ul>
          {result.warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      </section>
    </>
  );
}

export default function BacktestPage() {
  const { state, setState, demo } = useApp();
  const dataset = state.historicalReturns ?? null,
    savedConfig = state.backtestConfig ?? null;
  const [draft, setDraft] = useState<BacktestConfig | null>(null),
    [dirty, setDirty] = useState(false),
    [sourceName, setSourceName] = useState("User-uploaded monthly return series"),
    [sourceUrl, setSourceUrl] = useState(""),
    [returnBasis, setReturnBasis] = useState<HistoricalReturnBasis>("unknown"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");

  useEffect(() => {
    if (dataset) {
      setDraft(savedConfig ?? defaultBacktestConfig(state.holdings, dataset));
      setDirty(!savedConfig);
    } else {
      setDraft(null);
      setDirty(false);
    }
  }, [dataset, savedConfig, state.holdings]);

  const draftResult = useMemo(
    () => (dataset && draft ? runHistoricalComparison(dataset, draft) : null),
    [dataset, draft]
  );
  const savedResult = useMemo(
    () =>
      !dirty && dataset && savedConfig
        ? runHistoricalComparison(dataset, savedConfig)
        : null,
    [dataset, dirty, savedConfig]
  );

  async function importFile(file: File | undefined) {
    setError("");
    setNotice("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a .csv file. No file contents are uploaded directly; only normalized monthly return rows are saved.");
      return;
    }
    if (file.size > 1_000_000) {
      setError("The CSV must be 1 MB or smaller.");
      return;
    }
    const cleanSource = sourceName.trim();
    if (!cleanSource) {
      setError("Enter a source name (for example, a report or provider) before importing.");
      return;
    }
    if (sourceUrl) {
      try {
        if (new URL(sourceUrl.trim()).protocol !== "https:") throw new Error();
      } catch {
        setError("Source reference must be a valid HTTPS URL or left blank.");
        return;
      }
    }
    setBusy(true);
    try {
      const csv = await file.text(),
        parsed = parseHistoricalReturnsCSV(csv);
      if (parsed.errors.length) {
        setError(parsed.errors.join(" "));
        return;
      }
      if (parsed.observations.length < 2) {
        setError("Import at least two monthly observations; short windows have limited interpretation.");
        return;
      }
      const now = new Date().toISOString(),
        nextDataset: HistoricalReturnDataset = {
          sourceType: "user-uploaded",
          verificationStatus: "unverified",
          sourceName: cleanSource,
          sourceUrl: sourceUrl.trim() || null,
          uploadedAt: now,
          currency: "INR",
          frequency: "monthly",
          returnBasis,
          startMonth: parsed.observations[0]!.month,
          endMonth: parsed.observations[parsed.observations.length - 1]!.month,
          missingDataTreatment: RETURN_MISSING_POLICY,
          observations: parsed.observations,
        },
        nextConfig = defaultBacktestConfig(state.holdings, nextDataset);
      setState({
        ...state,
        historicalReturns: nextDataset,
        backtestConfig: null,
      });
      setDraft(nextConfig);
      setDirty(true);
      setNotice(`Imported ${parsed.observations.length} monthly observations. Source is user-uploaded and not independently verified.`);
      if (parsed.warnings.length) setNotice(`${parsed.warnings.join(" ")} ${parsed.observations.length} months imported; use zero target weight for any omitted bucket.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The CSV could not be read.");
    } finally {
      setBusy(false);
    }
  }

  function updateDraft(next: BacktestConfig) {
    setDraft(next);
    setDirty(true);
    setError("");
    setNotice("");
  }
  function updateWeight(
    field: "baselineWeights" | "allWeatherWeights",
    bucket: (typeof ASSET_BUCKETS)[number],
    value: string
  ) {
    if (!draft) return;
    updateDraft({
      ...draft,
      [field]: {
        ...draft[field],
        [bucket]: value === "" ? 0 : Number(value),
      },
    });
  }
  function saveComparison() {
    setError("");
    if (!dataset || !draft || !draftResult) return;
    if (draftResult.status !== "ready") {
      setError(draftResult.message);
      return;
    }
    setState({ ...state, backtestConfig: draft });
    setDirty(false);
    setNotice("Comparison settings saved. Dashboard, report and Coach now use the same shared calculation result.");
  }
  function removeHistory() {
    if (!window.confirm("Remove the uploaded monthly return history and its comparison settings from this workspace? This cannot be undone.")) return;
    setState({ ...state, historicalReturns: null, backtestConfig: null });
    setDraft(null);
    setDirty(false);
    setError("");
    setNotice("Uploaded return observations and comparison settings were removed from this workspace.");
  }
  const baselineTotal = draft
    ? ASSET_BUCKETS.reduce((sum, bucket) => sum + draft.baselineWeights[bucket], 0)
    : 0,
    allWeatherTotal = draft
      ? ASSET_BUCKETS.reduce((sum, bucket) => sum + draft.allWeatherWeights[bucket], 0)
      : 0;
  const selectedMissing = draftResult?.source.missingMonths.length ?? 0;

  return (
    <>
      <div className="page-title-with-tools">
        <header className="page-title">
          <div className="eyebrow">QUANTITATIVE RESEARCH · USER DATA ONLY</div>
          <h1>Historical portfolio comparison.</h1>
          <p>Compare an editable baseline with an All-Weather-inspired allocation using your own monthly asset-bucket return series. No demo history, live-price feed or synthetic performance is used here.</p>
        </header>
        <ReportDownload state={state} section="backtest" title="Saved backtest comparison" unavailable={!dataset ? "Upload return history before exporting." : dirty ? "Save the changed comparison before exporting." : !savedResult || savedResult.status !== "ready" ? "No ready saved comparison is available." : undefined} />
      </div>
      {demo && (
        <div className="note-box" role="note">
          <b>Demo portfolio does not include historical market returns.</b> Upload your own monthly return observations to calculate a backtest; the seeded holdings and illustrative stress scenarios are not used as historical evidence.
        </div>
      )}
      {!dataset ? (
        <div className="backtest-import-grid">
          <section className="card">
            <span className="eyebrow">IMPORT MONTHLY RETURNS</span>
            <h2>Bring a return series</h2>
            <p>Upload a wide CSV with one YYYY-MM row per month and monthly simple returns for asset buckets. Blank cells remain missing. The source file is read in this browser; only normalized rows and provenance are stored with this workspace.</p>
            <div className="form-grid">
              <label>
                Data source name
                <input value={sourceName} onChange={event => setSourceName(event.target.value)} maxLength={120} placeholder="e.g. monthly portfolio export" />
              </label>
              <label>
                Source reference URL (optional)
                <input value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} maxLength={500} type="url" placeholder="https://…" />
              </label>
              <label>
                Return basis
                <select value={returnBasis} onChange={event => setReturnBasis(event.target.value as HistoricalReturnBasis)}>
                  <option value="total-return">Total return (user-selected)</option>
                  <option value="price-only">Price-only (dividends excluded)</option>
                  <option value="unknown">Unknown / not confirmed</option>
                </select>
              </label>
              <label>
                Monthly returns CSV (≤ 1 MB)
                <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { void importFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }} />
              </label>
            </div>
            {error && <p className="error-box" role="alert">{error}</p>}
            <p className="note">Required period header: <code>month</code>, <code>date</code> or <code>period</code> using YYYY-MM or ISO YYYY-MM-DD. Recognized bucket headers include Equity/Stocks/Nifty, Mutual Funds/MF, Gold/Gold ETF, Debt/Bonds/Fixed Income and Cash. Values are percentage points (enter 1.2 for 1.2%, not 0.012); allowed range is greater than −100% to +500% per month.</p>
            <p className="note">{RETURN_MISSING_POLICY} Missing bucket columns remain unavailable until you set that bucket's weight to 0 in both strategies. We do not forward-fill or interpolate.</p>
            <p className="note"><b>Privacy:</b> Upload only anonymized bucket-level returns. Do not include names, account numbers, credentials or individual security-level personal data. The CSV itself is not retained.</p>
          </section>
          <section className="card">
            <span className="eyebrow">CSV SHAPE</span>
            <h2>Example headers</h2>
            <div className="table-scroll">
              <table>
                <thead><tr><th>month</th><th>Equity (%)</th><th>Mutual Funds (%)</th><th>Gold (%)</th><th>Debt (%)</th><th>Cash (%)</th></tr></thead>
                <tbody><tr><td>2022-01</td><td>-2.1</td><td>-1.4</td><td>0.7</td><td>0.2</td><td>0.1</td></tr><tr><td>2022-02</td><td>1.3</td><td>1.0</td><td>-0.2</td><td>0.3</td><td>0.1</td></tr></tbody>
              </table>
            </div>
            <p className="note">Example values above are format-only placeholders, not historical data, not present in the app's calculation engine, and not a downloadable data series.</p>
            <div className="note-box">A two-strategy comparison requires every bucket with non-zero weight in either strategy for each month in the common window. You can reduce target weights to zero where your file has no series; otherwise the result is blocked instead of assuming a return.</div>
          </section>
        </div>
      ) : (
        <>
          <section className="card backtest-source">
            <div className="card-heading">
              <div>
                <span className="eyebrow">USER-UPLOADED · NOT INDEPENDENTLY VERIFIED</span>
                <h2>{dataset.sourceName}</h2>
                <p>{dataset.startMonth} to {dataset.endMonth} · {dataset.observations.length} observations · INR · monthly · {BASIS_LABEL[dataset.returnBasis]}</p>
              </div>
              <button className="button outline" onClick={removeHistory}>Remove history</button>
            </div>
            <p className="note">Imported {new Date(dataset.uploadedAt).toLocaleString()}. {dataset.sourceUrl ? <>User-supplied reference: <a href={dataset.sourceUrl} target="_blank" rel="noreferrer">{dataset.sourceUrl}</a>. </> : null}No source verification was performed. The underlying CSV file is not stored.</p>
          </section>
          {draft && (
            <>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">COMMON ASSUMPTIONS</span>
                    <h2>Define a fair comparison</h2>
                    <p>Both strategies use the same dates, currency, return rows, rebalance cadence, cost and risk-free rate.</p>
                  </div>
                </div>
                <div className="form-grid">
                  <label>Start month<input type="month" min={dataset.startMonth} max={dataset.endMonth} value={draft.startMonth} onChange={event => updateDraft({ ...draft, startMonth: event.target.value })} /></label>
                  <label>End month<input type="month" min={dataset.startMonth} max={dataset.endMonth} value={draft.endMonth} onChange={event => updateDraft({ ...draft, endMonth: event.target.value })} /></label>
                  <label>Rebalance frequency<select value={draft.rebalanceFrequency} onChange={event => updateDraft({ ...draft, rebalanceFrequency: event.target.value as BacktestConfig["rebalanceFrequency"] })}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="annual">Annual</option><option value="none">No rebalancing after start</option></select></label>
                  <label>Flat transaction-cost assumption (bps)<input type="number" min="0" max="1000" step="1" value={draft.transactionCostBps} onChange={event => updateDraft({ ...draft, transactionCostBps: Number(event.target.value) })} /></label>
                  <label>Annual risk-free rate (%)<input type="number" min="-99.9" max="100" step="0.1" value={draft.riskFreeAnnualPct} onChange={event => updateDraft({ ...draft, riskFreeAnnualPct: Number(event.target.value) })} /></label>
                </div>
                <p className="note">Default cost is 10 bps on one-way turnover at each rebalance. This is an editable placeholder—not a broker fee estimate. Taxes, setup/entry costs, slippage and market impact are excluded.</p>
              </section>
              <section className="card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">EDITABLE ASSET BUCKET WEIGHTS</span>
                    <h2>Baseline and comparison target</h2>
                    <p>Each strategy must sum to 100%. Portfolio holdings are a suggested starting baseline when present; without holdings, the equal-weight starting values are only a UI placeholder.</p>
                  </div>
                </div>
                <div className="table-scroll">
                  <table className="weight-table">
                    <thead><tr><th>Asset bucket</th><th>Baseline %</th><th>All-Weather-inspired %</th></tr></thead>
                    <tbody>{ASSET_BUCKETS.map(bucket => <tr key={bucket}><th>{bucket}</th><td><label className="sr-only" htmlFor={`baseline-${bucket}`}>Baseline {bucket} weight percentage</label><input id={`baseline-${bucket}`} type="number" min="0" max="100" step="0.1" value={draft.baselineWeights[bucket]} onChange={event => updateWeight("baselineWeights", bucket, event.target.value)} /></td><td><label className="sr-only" htmlFor={`weather-${bucket}`}>All-Weather-inspired {bucket} weight percentage</label><input id={`weather-${bucket}`} type="number" min="0" max="100" step="0.1" value={draft.allWeatherWeights[bucket]} onChange={event => updateWeight("allWeatherWeights", bucket, event.target.value)} /></td></tr>)}</tbody>
                  </table>
                </div>
                <div className="weight-sums"><span>Baseline sum: <b className={Math.abs(baselineTotal - 100) < 0.05 ? "positive" : "negative"}>{baselineTotal.toFixed(1)}%</b></span><span>Comparison sum: <b className={Math.abs(allWeatherTotal - 100) < 0.05 ? "positive" : "negative"}>{allWeatherTotal.toFixed(1)}%</b></span></div>
                <p className="note">Illustrative All-Weather-inspired defaults: Equity 30%, Mutual Funds 20%, Gold 15%, Debt 30%, Cash 5%. This is not a universal allocation or a representation of any named investor's exact strategy.</p>
                <div className="form-actions"><button className="button primary" onClick={saveComparison} disabled={busy || !draftResult || draftResult.status !== "ready" || Math.abs(baselineTotal - 100) > 0.05 || Math.abs(allWeatherTotal - 100) > 0.05}>{dirty ? "Run & save comparison" : "Recalculate comparison"}</button></div>
                {draftResult && draftResult.status !== "ready" && <p className="error-box" role="status">{draftResult.message}{selectedMissing ? ` Missing complete months: ${draftResult.source.missingMonths.join(", ")}` : ""}</p>}
                {error && <p className="error-box" role="alert">{error}</p>}
                {notice && <p className="success-box" role="status">{notice}</p>}
              </section>
              {!savedResult && !dirty && <section className="card"><h2>Run the comparison to see results</h2><p>The imported data is stored, but performance results are not calculated until both target mixes and assumptions are valid.</p></section>}
              {savedResult && <ComparisonResults result={savedResult} />}
              {dirty && draftResult?.status === "ready" && <section className="card"><h2>Inputs are ready</h2><p>Settings changed. Run and save the comparison to replace the previously saved result. The old result is hidden until it matches the current data and assumptions.</p></section>}
            </>
          )}
        </>
      )}
      {notice && !dataset && <p className="success-box" role="status">{notice}</p>}
    </>
  );
}
