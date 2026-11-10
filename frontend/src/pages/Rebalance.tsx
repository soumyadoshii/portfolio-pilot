import { useApp } from "@/contexts/AppContext";
import { allocationReview, assetAllocation, portfolioTotal, weatherExposure } from "@shared/finance";
import { ASSET_BUCKETS, type AssetBucket } from "@shared/portfolio";
import { Button, Card, Empty, Title } from "@/components/common";
import { ReportDownload } from "@/components/ReportDownload";
import { money } from "@/lib/format";

export function Rebalance() {
  const { state, setState } = useApp();
  const alloc = assetAllocation(state.holdings),
    total = portfolioTotal(state.holdings),
    weather = weatherExposure(state.holdings),
    rows = allocationReview(
      state.holdings,
      state.allocationTargets,
      state.tolerancesPct
    ),
    primaryGoal = state.goals
      .slice()
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0],
    riskFocus: Record<AssetBucket, string> = {
      Equity: "equity drawdown and single-bucket concentration",
      "Mutual Funds": "market exposure and possible fund overlap",
      Gold: "inflation sensitivity and non-equity diversification",
      Debt: "interest-rate, credit and defensive-allocation balance",
      Cash: "liquidity needs versus long-term inflation drag",
    };
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="ALL-WEATHER-INSPIRED SCENARIO FRAMEWORK"
          title="Review balance across regimes."
          sub="A descriptive framework for growth, inflation, deflation and recession-sensitive exposures—not an exact named-investor portfolio."
        />
        <ReportDownload state={state} section="allocation" title="Allocation report" scopes={[{ value: "all", label: "Complete allocation" }, ...ASSET_BUCKETS.map(bucket => ({ value: bucket, label: bucket }))]} unavailable={!state.holdings.length ? "Add holdings before exporting allocation." : undefined} />
      </div>
      {!state.holdings.length ? (
        <Card>
          <Empty
            title="Add holdings before reviewing allocation"
            body="There is no portfolio mix to compare yet. Add positions in Portfolio."
            action={<Button href="/portfolio">Add holdings</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="weather-grid">
            {Object.entries(weather).map(([k, v]) => (
              <Card key={k} className="weather-card">
                <span>
                  {k
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, s => s.toUpperCase())}
                  -sensitive
                </span>
                <b>{v.toFixed(1)}%</b>
                <small>Current exposure proxy · heuristic</small>
              </Card>
            ))}
          </div>
          <Card>
            <div className="card-heading">
              <div>
                <span className="eyebrow">ILLUSTRATIVE TARGET REVIEW</span>
                <h2>Current mix and your ranges</h2>
                <p>
                  Targets/tolerances are editable. Allocations shown in
                  percentage points; no trades are placed.
                </p>
              </div>
              <Button
                kind="outline"
                onClick={() =>
                  setState({
                    ...state,
                    allocationTargets: {
                      Equity: 35,
                      "Mutual Funds": 25,
                      Gold: 10,
                      Debt: 25,
                      Cash: 5,
                    },
                  })
                }
              >
                Load balanced example
              </Button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Asset bucket</th>
                    <th>Current</th>
                    <th>Target</th>
                    <th>Drift</th>
                    <th>Tolerance</th>
                    <th>Illustrative value adjustment</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.bucket}>
                      <td>
                        <b>{r.bucket}</b>
                      </td>
                      <td>
                        {(total ? (alloc[r.bucket] / total) * 100 : 0).toFixed(
                          1
                        )}
                        %
                      </td>
                      <td>
                        <input
                          className="small-number"
                          aria-label={`${r.bucket} target percent`}
                          type="number"
                          min="0"
                          max="100"
                          value={state.allocationTargets[r.bucket]}
                          onChange={e =>
                            setState({
                              ...state,
                              allocationTargets: {
                                ...state.allocationTargets,
                                [r.bucket]: Number(e.target.value),
                              },
                            })
                          }
                        />
                        %
                      </td>
                      <td className={r.driftPct > 0 ? "positive" : "negative"}>
                        {r.driftPct > 0 ? "+" : ""}
                        {r.driftPct.toFixed(1)} pp
                      </td>
                      <td>
                        <input
                          className="small-number"
                          aria-label={`${r.bucket} tolerance percentage points`}
                          type="number"
                          min="0"
                          value={state.tolerancesPct[r.bucket]}
                          onChange={e =>
                            setState({
                              ...state,
                              tolerancesPct: {
                                ...state.tolerancesPct,
                                [r.bucket]: Number(e.target.value),
                              },
                            })
                          }
                        />{" "}
                        pp
                      </td>
                      <td>
                        {r.adjustmentValue < 0 ? "−" : "+"}
                        {money(Math.abs(r.adjustmentValue))}
                      </td>
                      <td>
                        {r.outsideTolerance ? (
                          <>
                            <span className="pill attention">
                              Outside tolerance
                            </span>
                            <small className="note">
                              Consider {r.adjustmentValue > 0 ? "increasing" : "reducing"} this bucket by {money(Math.abs(r.adjustmentValue))}: drift is {r.driftPct > 0 ? "+" : ""}{r.driftPct.toFixed(1)} pp beyond the ±{state.tolerancesPct[r.bucket]} pp tolerance. Risk lens: {riskFocus[r.bucket]}. Goal context: {primaryGoal ? `nearest-dated goal is ${primaryGoal.name} (${primaryGoal.targetDate}); this is portfolio-level, not a goal-specific asset mapping` : "no saved goal is linked to this review"}. Assumptions: total value × (target − current share); no taxes, transaction costs or security-level constraints.
                            </small>
                          </>
                        ) : (
                          <>
                            <span className="pill neutral">Within range</span>
                            <small className="note">
                              No change suggested. Risk lens: {riskFocus[r.bucket]}. Goal context: {primaryGoal ? `${primaryGoal.name} (${primaryGoal.targetDate}); no goal-specific asset mapping` : "no saved goal linked"}. Assumptions: illustrative percentage-point comparison only; no taxes, transaction costs or security-level constraints.
                            </small>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              Bucket targets currently total{" "}
              {Object.values(state.allocationTargets).reduce(
                (a, b) => a + b,
                0
              )}
              %. Illustrative currency adjustment = total current portfolio ×
              (target − current share). Taxes, transaction costs and
              security-level constraints are excluded. “Review adjustment” does
              not execute a trade.
            </p>
            <div className="button-row">
              <Button
                kind="outline"
                onClick={() =>
                  alert(
                    "Review only. No broker connection or trade execution is available."
                  )
                }
              >
                Review adjustment
              </Button>
              <Button
                kind="text"
                onClick={() =>
                  setState({
                    ...state,
                    allocationTargets: {
                      Equity: 40,
                      "Mutual Funds": 25,
                      Gold: 10,
                      Debt: 20,
                      Cash: 5,
                    },
                  })
                }
              >
                Restore example targets
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
