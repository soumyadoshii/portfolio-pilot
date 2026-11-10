import { useApp } from "@/contexts/AppContext";
import { SYNTHETIC_CORRELATIONS } from "@/data/demo";
import { calculateReturnCorrelations, runHistoricalComparison } from "@shared/backtest";
import { assetAllocation, generatePortfolioReport, goalProjection, portfolioTotal, scoreDiversification } from "@shared/finance";
import { type Goal } from "@shared/portfolio";
import { Activity, ArrowRight, Layers, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Link } from "wouter";
import { useState } from "react";
import { Button, Card, Donut, Empty, Kpi, Title } from "@/components/common";
import { ReportDownload } from "@/components/ReportDownload";
import { DISCLAIMER, money } from "@/lib/format";
import { downloadBytes } from "@/lib/reportExports";

export function Dashboard() {
  const { state, setState, demo, user, api, saveAccountState } = useApp();
  const [reportBusy, setReportBusy] = useState(false), [reportError, setReportError] = useState("");
  const total = portfolioTotal(state.holdings),
    alloc = assetAllocation(state.holdings),
    correlationMatrix =
      state.dataOrigin === "demo"
        ? SYNTHETIC_CORRELATIONS
        : calculateReturnCorrelations(state.historicalReturns)?.values,
    div = scoreDiversification(state.holdings, correlationMatrix),
    backtestResult = runHistoricalComparison(
      state.historicalReturns,
      state.backtestConfig
    ),
    topGoals = state.goals.slice(0, 3);
  const rows = state.snapshots.map(s => ({
    label: s.label,
    value: s.totalValue,
  }));
  async function generateReport() {
    setReportError("");
    let report = generatePortfolioReport(state, backtestResult);
    if (user && state.preferences.aiReportConsent) {
      setReportBusy(true);
      try {
        await saveAccountState(state);
        const out = await api("/api/app/report-commentary", { method: "POST", body: JSON.stringify({ aiConsent: true }) });
        if (typeof out.commentary !== "string" || !["ai", "deterministic"].includes(out.source)) throw new Error("Invalid report commentary response.");
        report = { ...report, aiCommentary: out.commentary, commentarySource: out.source === "ai" ? "ai" : "deterministic" };
      } catch (e) {
        setReportError(e instanceof Error ? e.message : "AI commentary request failed; deterministic report is available.");
      } finally { setReportBusy(false); }
    }
    setState({ ...state, reports: [report, ...state.reports] });
  }
  function downloadMarkdown() {
    const report: any = state.reports[0] || generatePortfolioReport(state, backtestResult);
    const md = `# ${report.title}\n\n${report.sections.map((section: any) => `## ${section.heading}\n\n${section.body}`).join("\n\n")}${report.aiCommentary ? `\n\n## Commentary (${report.commentarySource})\n\n${report.aiCommentary}` : ""}\n\n${DISCLAIMER}\n`;
    downloadBytes(new TextEncoder().encode(md), "portfoliopilot-report.md", "text/markdown");
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow={
            demo ? "DEMO WORKSPACE · SYNTHETIC DATA" : "PORTFOLIO OVERVIEW"
          }
          title={`Good ${new Date().getHours() < 12 ? "morning" : "day"}${state.profile.name ? `, ${state.profile.name.split(" ")[0]}` : ""}.`}
          sub="A considered view of your portfolio, progress and potential pressure points."
        />
        <ReportDownload state={state} section="overview" title="Portfolio overview" />
      </div>
      <div className="kpi-grid">
        <Kpi
          label="Portfolio value"
          value={money(total)}
          detail={`${state.holdings.length} holdings · ${demo ? "synthetic demo values" : "entered/user-supplied values"}`}
          icon={Wallet}
        />
        <Kpi
          label="Diversification method score"
          value={`${div.total} / 100`}
          detail={`${div.coveragePct}% methodology-weight coverage · not an official rating`}
          icon={Layers}
        />
        <Kpi
          label="Portfolio risk profile"
          value={state.profile.riskProfile || "Not set"}
          detail="Self-reported educational profile"
          icon={ShieldCheck}
        />
        <Kpi
          label="Monthly investment"
          value={money(state.profile.monthlyInvestment)}
          detail="Profile input · editable in settings"
          icon={Activity}
        />
      </div>
      {!state.holdings.length ? (
        <Card>
          <Empty
            title="Your portfolio starts here"
            body="Add a holding, import a CSV or use the demo to explore the analytics."
            action={
              <div className="button-row">
                <Button href="/portfolio">Add holdings</Button>
                <Button kind="outline" href="/portfolio">
                  Import a CSV in Portfolio
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <div className="dashboard-grid">
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">01 · VALUE HISTORY</span>
                  <h2>Portfolio snapshots</h2>
                  <p>Synthetic historical snapshots; not live market data.</p>
                </div>
                <Link href="/portfolio">
                  View portfolio <ArrowRight size={14} />
                </Link>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={245}>
                  <AreaChart data={rows}>
                    <defs>
                      <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#55799a"
                          stopOpacity={0.24}
                        />
                        <stop
                          offset="100%"
                          stopColor="#55799a"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7ebed" />
                    <XAxis dataKey="label" />
                    <YAxis
                      tickFormatter={v => `${(v / 10000000).toFixed(1)}Cr`}
                      width={50}
                    />
                    <ChartTooltip formatter={(v: any) => money(Number(v))} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#55799a"
                      fill="url(#fillBlue)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="chart-caption">
                  Past snapshots are synthetic examples and are not investment
                  performance.
                </p>
              </div>
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">02 · ALLOCATION</span>
                  <h2>Asset mix</h2>
                </div>
                <Link href="/portfolio">
                  Details <ArrowRight size={14} />
                </Link>
              </div>
              <Donut
                data={Object.entries(alloc).map(([name, v]) => ({
                  name,
                  value: total ? (v / total) * 100 : 0,
                }))}
              />
            </Card>
          </div>
          <div className="dashboard-grid">
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">03 · GOALS</span>
                  <h2>Goals in view</h2>
                </div>
                <Link href="/goals">
                  All goals <ArrowRight size={14} />
                </Link>
              </div>
              {topGoals.length ? (
                <div className="goal-list">
                  {topGoals.map(g => (
                    <GoalTile key={g.id} goal={g} />
                  ))}
                </div>
              ) : (
                <Empty
                  title="No goals yet"
                  body="Add a target and date to connect savings to your priorities."
                  action={<Button href="/goals">Create a goal</Button>}
                />
              )}
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">04 · ONE THING TO REVIEW</span>
                  <h2>Know what you’re carrying</h2>
                </div>
                <Sparkles size={19} />
              </div>
              <p className="body-copy">
                {state.holdings.length
                  ? `Your largest current holding is ${[...state.holdings].sort((a, b) => b.currentValue - a.currentValue)[0].name}, at ${((Math.max(...state.holdings.map(h => h.currentValue)) / total) * 100).toFixed(1)}% of the portfolio. The diversification score uses five disclosed components.`
                  : "Add holdings to see a state-grounded concentration note."}
              </p>
              <p className="note">
                This description is based only on the values in this workspace.
                It is not a recommendation.
              </p>
              <div className="link-stack">
                <Link href="/stress-test">
                  Explore an illustrative shock <ArrowRight size={15} />
                </Link>
                <Link href="/ai-coach">
                  Ask the PortfolioPilot Coach <ArrowRight size={15} />
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
      <Card className="backtest-dashboard-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">HISTORICAL RESEARCH</span>
            <h2>Compare strategy history</h2>
            {backtestResult?.status === "ready" &&
            backtestResult.baseline &&
            backtestResult.allWeather ? (
              <p>
                {backtestResult.source.nObs} user-uploaded months · baseline
                CAGR {backtestResult.baseline.metrics.cagr.value === null
                  ? "unavailable"
                  : `${backtestResult.baseline.metrics.cagr.value.toFixed(2)}%`}
                {" · "}All-Weather-inspired CAGR{" "}
                {backtestResult.allWeather.metrics.cagr.value === null
                  ? "unavailable"
                  : `${backtestResult.allWeather.metrics.cagr.value.toFixed(2)}%`}
              </p>
            ) : state.historicalReturns ? (
              <p>Monthly data is imported but a complete comparison is not yet saved.</p>
            ) : (
              <p>No historical market returns are bundled or inferred for this workspace.</p>
            )}
          </div>
          <Link href="/backtest">
            Open research <ArrowRight size={14} />
          </Link>
        </div>
        <p className="note">
          Historical outputs use only user-uploaded monthly returns, are marked
          unverified and are not forecasts. Demo stress scenarios are separate
          illustrative sensitivities.
        </p>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">REPORT HISTORY</span>
            <h2>Keep a portfolio note</h2>
            <p>Generate a deterministic report from this workspace, or request account AI commentary when explicitly enabled in Settings.</p>
          </div>
        </div>
        <div className="report-actions">
          <Button onClick={generateReport} disabled={reportBusy}>{reportBusy ? "Generating…" : "Generate report"}</Button>
          <Button kind="outline" onClick={() => window.print()}>Print / Save as PDF</Button>
          <Button kind="outline" onClick={downloadMarkdown}>Download Markdown</Button>
        </div>
        {reportError && <p className="error-box" role="alert">{reportError} The deterministic report is still available.</p>}
        {!user && <p className="note">Guest/demo reports use local deterministic commentary only; no report API is called.</p>}
        {state.reports.length ? <div className="history-item"><b>{state.reports[0]!.title}</b><small>{new Date(state.reports[0]!.createdAt).toLocaleString()} · {state.reports[0]!.commentarySource} commentary</small></div> : <p className="note">No saved report yet.</p>}
      </Card>
    </>
  );
}

export function GoalTile({ goal }: { goal: Goal }) {
  const p = goalProjection(goal);
  return (
    <Link href={`/goals/${goal.id}`} className="goal-tile">
      <div className="goal-tile-head">
        <div>
          <strong>{goal.name}</strong>
          <small>
            {goal.category} · {p.years.toFixed(1)} years
          </small>
        </div>
        <span className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}>
          {p.status}
        </span>
      </div>
      <div className="progress">
        <i style={{ width: `${p.progressPct}%` }} />
      </div>
      <div className="goal-tile-foot">
        <span>{money(goal.currentAmount)} saved</span>
        <b>{p.progressPct.toFixed(0)}%</b>
      </div>
    </Link>
  );
}
