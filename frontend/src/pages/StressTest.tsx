import { useApp } from "@/contexts/AppContext";
import { SCENARIOS } from "@/data/demo";
import { calculateStress, portfolioTotal } from "@shared/finance";
import { type AssetBucket } from "@shared/portfolio";
import { Activity, ArrowDownRight, Wallet } from "lucide-react";
import { useState } from "react";
import { Button, Card, Empty, Kpi, Title } from "@/components/common";
import { ReportDownload } from "@/components/ReportDownload";
import { money } from "@/lib/format";

export function StressTest() {
  const { state, setState } = useApp();
  const [id, setId] = useState("correction"),
    [name, setName] = useState("My custom scenario"),
    [shocks, setShocks] = useState<Record<AssetBucket, number>>({
      Equity: -20,
      "Mutual Funds": -14,
      Gold: 2,
      Debt: 0,
      Cash: 0,
    });
  const total = portfolioTotal(state.holdings),
    scenario =
      id === "custom"
        ? {
            id: "custom",
            name,
            description: "User-defined illustrative scenario",
            returnsPct: shocks,
            recoveryMonths: 18,
            isCustom: true,
          }
        : SCENARIOS.find(x => x.id === id)!;
  const result = calculateStress(state.holdings, scenario, state.goals);
  const savedResult = state.stressResult;
  const visibleResult =
    savedResult &&
    savedResult.scenarioId === result.scenarioId &&
    savedResult.scenarioName === result.scenarioName &&
    savedResult.beforeValue === result.beforeValue &&
    savedResult.afterValue === result.afterValue &&
    savedResult.changeValue === result.changeValue &&
    savedResult.lossPct === result.lossPct &&
    savedResult.recoveryMonths === result.recoveryMonths &&
    JSON.stringify(savedResult.assumptions) ===
      JSON.stringify(result.assumptions) &&
    JSON.stringify(savedResult.holdingImpacts) ===
      JSON.stringify(result.holdingImpacts) &&
    JSON.stringify(savedResult.goalImpacts) === JSON.stringify(result.goalImpacts)
      ? savedResult
      : null;
  function run() {
    setState({
      ...state,
      stressResult: result,
      notifications: [
        {
          id: `stress-${Date.now()}`,
          type: "stress",
          title: "Stress scenario completed",
          message: `${scenario.name} sensitivity updated.`,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...state.notifications,
      ],
    });
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="STRESS TEST · ILLUSTRATIVE SENSITIVITY"
          title="Explore what could move."
          sub="Apply a disclosed percentage-point shock to current holding values. Scenarios are not historical reconstructions or predictions."
        />
        <ReportDownload state={state} section="stress" title="Saved stress scenario" unavailable={!visibleResult ? "Export is available only for the last saved scenario matching the current portfolio." : undefined} />
      </div>
      <Card>
        <div className="scenario-grid">
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              className={`scenario-choice ${id === s.id ? "selected" : ""}`}
              onClick={() => setId(s.id)}
            >
              <span>{s.name}</span>
              <small>{s.description}</small>
            </button>
          ))}
          <button
            className={`scenario-choice ${id === "custom" ? "selected" : ""}`}
            onClick={() => setId("custom")}
          >
            <span>Custom scenario</span>
            <small>Edit per-bucket assumptions.</small>
          </button>
        </div>
        {id === "custom" && (
          <div className="custom-scenario">
            <label>
              Scenario name
              <input value={name} onChange={e => setName(e.target.value)} />
            </label>
            <div className="shock-inputs">
              {Object.entries(shocks).map(([b, v]) => (
                <label key={b}>
                  {b} return (%)
                  <input
                    type="number"
                    value={v}
                    onChange={e =>
                      setShocks({ ...shocks, [b]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="assumptions">
          <strong>Assumptions: </strong>
          {Object.entries(scenario.returnsPct).map(([k, v]) => (
            <span key={k}>
              {k}{" "}
              <b>
                {v > 0 ? "+" : ""}
                {v}%
              </b>
            </span>
          ))}
          <small>
            Percentage points · {scenario.recoveryMonths} illustrative recovery
            months
          </small>
        </div>
        <Button onClick={run}>
          <Activity size={16} /> Run sensitivity
        </Button>
        {!visibleResult && (
          <p className="note" role="status">
            {savedResult
              ? `The previous run (${savedResult.scenarioName}) does not match the current scenario or portfolio data. `
              : "No matching sensitivity has been run yet. "}
            Run sensitivity to show results for these inputs.
          </p>
        )}
      </Card>
      {visibleResult && (
        <>
          <div className="kpi-grid">
            <Kpi
              label="Current value"
              value={money(result.beforeValue)}
              detail={`${state.holdings.length} holdings analyzed`}
              icon={Wallet}
            />
            <Kpi
              label="After scenario"
              value={money(result.afterValue)}
              detail={
                result.changeValue < 0
                  ? `Estimated decline ${money(Math.abs(result.changeValue))}`
                  : `Estimated increase ${money(result.changeValue)}`
              }
              icon={ArrowDownRight}
            />
            <Kpi
              label="Portfolio change"
              value={`${result.changeValue < 0 ? "−" : "+"}${result.lossPct.toFixed(1)}%`}
              detail="Weighted by current holding values"
              icon={Activity}
            />
            <Kpi
              label="Recovery horizon"
              value={`${result.recoveryMonths} months`}
              detail="Scenario assumption, not a forecast"
              icon={Activity}
            />
          </div>
          <div className="two-col">
            <Card>
              <h2>Impact by holding</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Before</th>
                      <th>Change</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.holdingImpacts
                      .slice()
                      .sort((a, b) => a.changeValue - b.changeValue)
                      .map(x => (
                        <tr key={x.holdingId}>
                          <td>
                            <b>{x.symbol}</b>
                            <small>{x.name}</small>
                          </td>
                          <td>{money(x.beforeValue)}</td>
                          <td
                            className={
                              x.changeValue < 0 ? "negative" : "positive"
                            }
                          >
                            {money(x.changeValue)}
                          </td>
                          <td>{money(x.afterValue)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <h2>Goal sensitivity</h2>
              {result.goalImpacts.length ? (
                result.goalImpacts.map(g => (
                  <div key={g.goalId} className="impact-row">
                    <b>{g.goalName}</b>
                    <span>
                      {money(g.beforeCorpus)} → {money(g.afterCorpus)}
                    </span>
                    <small>
                      Additional monthly contribution estimate:{" "}
                      {g.additionalMonthlyContribution === null
                        ? "unavailable after target date"
                        : money(g.additionalMonthlyContribution)}
                    </small>
                  </div>
                ))
              ) : (
                <Empty
                  title="No goals to compare"
                  body="Add goals to see their sensitivity."
                />
              )}
              <p className="note">
                This simplified sensitivity scales current goal capital by
                portfolio change; it is not a full plan recalculation.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
