import { useApp } from "@/contexts/AppContext";
import { DEMO_PERSONAS, SYNTHETIC_CORRELATIONS } from "@/data/demo";
import { portfolioTotal, scoreDiversification } from "@shared/finance";
import { Activity, ArrowRight, CloudSun, Compass, Layers, ShieldCheck, Target } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button, Card, Mark } from "@/components/common";
import { DISCLAIMER, money } from "@/lib/format";

export function Landing() {
  const { enterDemo } = useApp();
  const setLoc = useLocation()[1];
  const stat = [
    {
      n: money(portfolioTotal(DEMO_PERSONAS[0].state.holdings)),
      l: "Sample portfolio value",
    },
    { n: String(DEMO_PERSONAS[0].state.goals.length), l: "Life goals mapped" },
    {
      n: `${scoreDiversification(DEMO_PERSONAS[0].state.holdings, SYNTHETIC_CORRELATIONS).total} / 100`,
      l: "Diversification method score",
    },
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <Mark />
        <div>
          <Link href="/login">Sign in</Link>
          <Button kind="outline" href="/register">
            Create account
          </Button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Portfolio intelligence, made personal</div>
          <h1>Your Portfolio. Your Goals. Your All-Weather Strategy.</h1>
          <p className="hero-lead">
            Know what your portfolio is carrying—and how it connects to the life
            you’re building. Explore goals, diversification and illustrative
            stress scenarios without linking a broker.
          </p>
          <div className="hero-actions">
            <Button onClick={() => setLoc("/login")}>
              Analyze My Portfolio <ArrowRight size={16} />
            </Button>
            <Button
              kind="outline"
              onClick={async () => {
                if (await enterDemo("vikram")) setLoc("/dashboard");
              }}
            >
              Explore Demo
            </Button>
          </div>
          <div className="hero-foot">
            <ShieldCheck size={17} /> Educational analysis only · No trading ·
            No account connection
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-top">
            <div>
              <span className="demo-badge">
                <i /> DEMO DATA
              </span>
              <h3>A clearer view of the whole picture.</h3>
            </div>
            <Compass size={26} />
          </div>
          <div className="sample-value">
            <small>Illustrative portfolio value</small>
            <b>{money(portfolioTotal(DEMO_PERSONAS[0].state.holdings))}</b>
            <span>Across 22 synthetic holdings</span>
          </div>
          <div
            className="mini-chart"
            aria-label="Illustrative portfolio value history"
          >
            <svg viewBox="0 0 600 145" role="img">
              <title>Illustrative sample portfolio trend</title>
              <path
                d="M0 116 C65 100 75 119 126 86 S205 90 250 70 306 92 354 48 415 58 467 34 533 44 600 15"
                fill="none"
                stroke="#8cb4c7"
                strokeWidth="4"
              />
              <path
                d="M0 116 C65 100 75 119 126 86 S205 90 250 70 306 92 354 48 415 58 467 34 533 44 600 15 L600 145 L0 145Z"
                fill="#8cb4c7"
                opacity=".09"
              />
            </svg>
            <div>
              <span>Jan ’21</span>
              <span>Sample value snapshots · not market data</span>
              <span>Apr ’26</span>
            </div>
          </div>
          <div className="visual-stats">
            {stat.map(s => (
              <div key={s.l}>
                <b>{s.n}</b>
                <small>{s.l}</small>
              </div>
            ))}
          </div>
          <div className="allocation-preview">
            <span>Asset mix</span>
            {[
              ["Equity", 40],
              ["Mutual funds", 25],
              ["Debt", 20],
              ["Gold", 10],
              ["Cash", 5],
            ].map(([n, v]) => (
              <div key={n}>
                <span>{n}</span>
                <div className="allocation-line">
                  <i style={{ width: `${v}%` }} />
                </div>
                <b>{v}%</b>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section intro-section">
        <div>
          <span className="eyebrow">A better starting point</span>
          <h2>
            Investing has many moving parts.
            <br />
            Your decisions don’t have to.
          </h2>
        </div>
        <p>
          PortfolioPilot brings your holdings, goals and risk scenarios into one
          calm workspace. It explains what is known, what is assumed, and where
          a closer look may help.
        </p>
      </section>
      <section className="feature-grid">
        {[
          [
            Target,
            "01",
            "Goal Mapping",
            "Connect today’s savings and monthly contributions to dates and future costs.",
          ],
          [
            Activity,
            "02",
            "Stress Testing",
            "Explore how illustrative market shocks may change portfolio value and goal sensitivity.",
          ],
          [
            Layers,
            "03",
            "Diversification Health",
            "See exposure by asset class, sector, holding and synthetic correlation.",
          ],
          [
            CloudSun,
            "04",
            "All-Weather Rebalancing",
            "Review an all-weather-inspired framework and compare editable target ranges.",
          ],
        ].map(([Icon, n, title, body]: any) => (
          <Card key={title} className="feature-card">
            <div className="feature-num">{n}</div>
            <Icon size={22} />
            <h3>{title}</h3>
            <p>{body}</p>
            <span className="feature-link">
              Explore the analysis <ArrowRight size={14} />
            </span>
          </Card>
        ))}
      </section>
      <section className="how section">
        <div className="eyebrow">A useful review in three steps</div>
        <h2>Understand first. Decide for yourself.</h2>
        <div className="how-grid">
          {[
            [
              "01",
              "Bring a picture",
              "Add holdings manually, import a CSV or start with synthetic demo data.",
            ],
            [
              "02",
              "Make it about your goals",
              "Set targets, dates and contributions to see transparent projections.",
            ],
            [
              "03",
              "Explore the what-ifs",
              "Review stress sensitivities and allocation drift. Nothing is traded.",
            ],
          ].map(x => (
            <div key={x[0]}>
              <span>{x[0]}</span>
              <h3>{x[1]}</h3>
              <p>{x[2]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="coach-example">
        <div>
          <div className="eyebrow">A grounded coach, not a crystal ball</div>
          <h2>Questions deserve context.</h2>
          <p>
            The Coach explains calculations using the portfolio you entered.
            Guest answers stay local in your browser; account AI is opt-in.
          </p>
          <Button
            kind="light"
            onClick={async () => {
              if (await enterDemo("vikram")) setLoc("/ai-coach");
            }}
          >
            See a Coach example <ArrowRight size={16} />
          </Button>
        </div>
        <div className="chat-sample">
          <small>EXAMPLE · SYNTHETIC PORTFOLIO</small>
          <p className="question">
            “What happens to my portfolio if equities fall 20%?”
          </p>
          <p className="answer">
            “Using an illustrative −20% equity and −14% mutual-fund
            assumption—with other buckets unchanged—the estimated change is
            shown as a sensitivity, not a forecast.”
          </p>
          <span>Assumptions shown · No trading</span>
        </div>
      </section>
      <section className="privacy section">
        <ShieldCheck size={24} />
        <div>
          <h2>Your data stays yours.</h2>
          <p>
            No brokerage credentials. No money movement. No trades. Guest/demo
            activity stays in this browser; an account saves to PortfolioPilot
            only through the account API.
          </p>
        </div>
        <Button kind="outline" href="/help">
          How privacy works
        </Button>
      </section>
      <footer className="landing-footer">
        <Mark small />
        <p>{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
