import { useApp } from "@/contexts/AppContext";
import { goalProjection } from "@shared/finance";
import { GOAL_CATEGORIES, type Goal } from "@shared/portfolio";
import { Activity, Target, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Button, Card, Kpi, Title } from "@/components/common";
import { money } from "@/lib/format";

export function GoalDetail({ id }: { id: string }) {
  const { state, setState } = useApp(),
    goal = state.goals.find(g => g.id === id);
  if (!goal)
    return (
      <>
        <Title title="Goal not found" />
        <Button href="/goals">Return to goals</Button>
      </>
    );
  const p = goalProjection(goal),
    series = Array.from({ length: Math.min(p.months, 240) + 1 }, (_, i) => {
      const t = Math.min(i, p.months),
        r = Math.pow(1 + goal.expectedReturnPct / 100, 1 / 12) - 1,
        years = i / 12,
        corpus =
          goal.currentAmount * Math.pow(1 + r, t) +
          goal.monthlyContribution * (r ? (Math.pow(1 + r, t) - 1) / r : t);
      return {
        year: years.toFixed(1),
        projected: corpus,
        target:
          goal.targetAmount * Math.pow(1 + goal.inflationPct / 100, years),
      };
    });
  return (
    <>
      <Title
        eyebrow={goal.category.toUpperCase()}
        title={goal.name}
        sub="Illustrative goal projection · assumes regular monthly contributions and constant rates."
      />
      <div className="page-tools">
        <Button kind="outline" href="/goals">
          ← All goals
        </Button>
        <span className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}>
          {p.status}
        </span>
      </div>
      <div className="kpi-grid">
        <Kpi
          label="Inflation-adjusted target"
          value={money(p.targetInflationAdjusted)}
          detail={`Original target ${money(goal.targetAmount)}`}
          icon={Target}
        />
        <Kpi
          label="Projected corpus"
          value={money(p.projectedCorpus)}
          detail="Deterministic projection · constant-rate assumption · no probability estimate"
          icon={Activity}
        />
        <Kpi
          label="Monthly contribution"
          value={money(goal.monthlyContribution)}
          detail={`Required estimate ${p.requiredMonthlyContribution === null ? "unavailable after target date" : money(p.requiredMonthlyContribution)}`}
          icon={Wallet}
        />
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">PROJECTION PATH</span>
            <h2>Current path vs target</h2>
            <p>
              Target grows at the entered inflation rate; projection assumes
              constant return.
            </p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              label={{
                value: "Years from now",
                position: "insideBottom",
                offset: -5,
              }}
            />
            <YAxis tickFormatter={v => `${(v / 100000).toFixed(0)}L`} />
            <ChartTooltip formatter={(v: any) => money(Number(v))} />
            <Area
              dataKey="projected"
              name="Illustrative projected corpus"
              stroke="#55799a"
              fill="#55799a"
              fillOpacity={0.15}
            />
            <Area
              dataKey="target"
              name="Inflation-adjusted target"
              stroke="#b17a37"
              fill="#b17a37"
              fillOpacity={0.06}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          <span>
            <i />
            Projected corpus
          </span>
          <span>
            <i className="amber-dot" />
            Inflation-adjusted target
          </span>
        </div>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">EDIT ASSUMPTIONS</span>
            <h2>Make the inputs yours</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Goal name
            <input
              required
              maxLength={120}
              value={goal.name}
              onChange={e =>
                setState({
                  ...state,
                  goals: state.goals.map(g =>
                    g.id === id ? { ...g, name: e.target.value } : g
                  ),
                })
              }
            />
          </label>
          <label>
            Category
            <select
              value={goal.category}
              onChange={e =>
                setState({
                  ...state,
                  goals: state.goals.map(g =>
                    g.id === id
                      ? { ...g, category: e.target.value as Goal["category"] }
                      : g
                  ),
                })
              }
            >
              {GOAL_CATEGORIES.map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          {[
            ["Saved currently (₹)", "currentAmount"],
            ["Target amount (₹)", "targetAmount"],
            ["Monthly contribution (₹)", "monthlyContribution"],
            ["Expected return (% p.a.)", "expectedReturnPct"],
            ["Inflation (% p.a.)", "inflationPct"],
          ].map(([label, key]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                value={(goal as any)[key]}
                onChange={e =>
                  setState({
                    ...state,
                    goals: state.goals.map(g =>
                      g.id === id ? { ...g, [key]: Number(e.target.value) } : g
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="date-input">
          Target date
          <input
            type="date"
            value={goal.targetDate}
            onChange={e =>
              setState({
                ...state,
                goals: state.goals.map(g =>
                  g.id === id ? { ...g, targetDate: e.target.value } : g
                ),
              })
            }
          />
        </label>
        <p className="note">
          Status thresholds: on track at projected corpus ≥ inflation-adjusted
          target; needs attention at 75–99%; behind below 75%. Constant returns
          are an assumption, never a promise.
        </p>
      </Card>
    </>
  );
}
