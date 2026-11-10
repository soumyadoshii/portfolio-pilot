import { useApp } from "@/contexts/AppContext";
import { goalProjection } from "@shared/finance";
import { GOAL_CATEGORIES, type Goal } from "@shared/portfolio";
import { Plus } from "lucide-react";
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button, Card, Empty, Title } from "@/components/common";
import { ReportDownload } from "@/components/ReportDownload";
import { money } from "@/lib/format";

export function Goals() {
  const { state, setState } = useApp(),
    [, setLoc] = useLocation();
  const [form, setForm] = useState(false),
    [name, setName] = useState(""),
    [target, setTarget] = useState(""),
    [date, setDate] = useState("2035-01-01"),
    [monthly, setMonthly] = useState(""),
    [current, setCurrent] = useState("0"),
    [expectedReturn, setExpectedReturn] = useState("8"),
    [inflation, setInflation] = useState("5"),
    [category, setCategory] = useState<Goal["category"]>("Other");
  function add(e: React.FormEvent) {
    e.preventDefault();
    const g: Goal = {
      id: `goal-${Date.now()}`,
      name,
      category,
      targetAmount: Number(target),
      currentAmount: Number(current),
      targetDate: date,
      monthlyContribution: Number(monthly),
      expectedReturnPct: Number(expectedReturn),
      inflationPct: Number(inflation),
      createdAt: new Date().toISOString(),
    };
    setState({ ...state, goals: [...state.goals, g] });
    setForm(false);
    setName("");
    setTarget("");
    setMonthly("");
    setCurrent("0");
    setExpectedReturn("8");
    setInflation("5");
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="GOAL MAPPING"
          title="Keep the future in view."
          sub="Projections are illustrative, based on editable return, inflation and contribution assumptions."
        />
        <ReportDownload state={state} section="goals" title="Goals report" scopes={[{ value: "all", label: "All goals" }, ...state.goals.map(g => ({ value: g.id, label: g.name }))]} />
      </div>
      <div className="page-tools">
        <span>{state.goals.length} goals · Values in INR</span>
        <Button onClick={() => setForm(!form)}>
          <Plus size={16} /> Add a goal
        </Button>
      </div>
      {form && (
        <Card>
          <form className="form-grid" onSubmit={add}>
            <label>
              Goal name
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
              >
                {GOAL_CATEGORIES.map(x => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target amount (₹)
              <input
                type="number"
                min="1"
                required
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </label>
            <label>
              Current amount saved (₹)
              <input
                type="number"
                min="0"
                value={current}
                onChange={e => setCurrent(e.target.value)}
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </label>
            <label>
              Monthly contribution (₹)
              <input
                type="number"
                min="0"
                value={monthly}
                onChange={e => setMonthly(e.target.value)}
              />
            </label>
            <label>
              Expected return (% p.a.)
              <input
                type="number"
                min="-100"
                max="100"
                step="0.1"
                value={expectedReturn}
                onChange={e => setExpectedReturn(e.target.value)}
              />
            </label>
            <label>
              Inflation (% p.a.)
              <input
                type="number"
                min="-100"
                max="100"
                step="0.1"
                value={inflation}
                onChange={e => setInflation(e.target.value)}
              />
            </label>
            <p className="wide note">
              Projection horizon starts today ({new Date().toLocaleDateString("en-IN")}); return and inflation are editable assumptions, not forecasts.
            </p>
            <div className="form-actions wide">
              <Button type="submit">Save goal</Button>
              <Button kind="outline" onClick={() => setForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {state.goals.length ? (
        <div className="goal-cards">
          {state.goals.map(g => {
            const p = goalProjection(g);
            return (
              <Card key={g.id} className="goal-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">{g.category.toUpperCase()}</span>
                    <h2>{g.name}</h2>
                  </div>
                  <span
                    className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="goal-target">
                  {money(g.targetAmount)} <small>target amount</small>
                </div>
                <div className="progress">
                  <i style={{ width: `${p.progressPct}%` }} />
                </div>
                <div className="split-stats">
                  <span>
                    Saved now<strong>{money(g.currentAmount)}</strong>
                  </span>
                  <span>
                    Time remaining<strong>{p.years.toFixed(1)} years</strong>
                  </span>
                  <span>
                    Required SIP
                    <strong>
                      {p.requiredMonthlyContribution === null
                        ? "Unavailable"
                        : money(p.requiredMonthlyContribution)}
                    </strong>
                  </span>
                  <span>
                    Projected corpus<strong>{money(p.projectedCorpus)}</strong>
                  </span>
                </div>
                <p className="note">
                  Inflation adjusted target {money(p.targetInflationAdjusted)} ·
                  Assumed return {g.expectedReturnPct}% · Inflation{" "}
                  {g.inflationPct}%
                </p>
                <div className="button-row">
                  <Button
                    kind="outline"
                    onClick={() => setLoc(`/goals/${g.id}`)}
                  >
                    View projection
                  </Button>
                  <Button
                    kind="text"
                    onClick={() => {
                      if (confirm(`Delete “${g.name}”?`))
                        setState({
                          ...state,
                          goals: state.goals.filter(x => x.id !== g.id),
                        });
                    }}
                  >
                    Delete goal
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            title="Goals make the numbers meaningful"
            body="Add a target amount, date and monthly contribution to see a transparent projection."
            action={
              <Button onClick={() => setForm(true)}>
                Create your first goal
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
