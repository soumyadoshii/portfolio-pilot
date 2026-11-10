import { useApp } from "@/contexts/AppContext";
import { SYNTHETIC_CORRELATIONS } from "@/data/demo";
import { calculateReturnCorrelations } from "@shared/backtest";
import { assetAllocation, assetBucketFor, parseHoldingsCSV, portfolioTotal, scoreDiversification } from "@shared/finance";
import { ASSET_BUCKETS, type Holding } from "@shared/portfolio";
import { Activity, ArrowRight, Layers, Plus, Search, Trash2, Upload, Wallet } from "lucide-react";
import React, { useState } from "react";
import { Link } from "wouter";
import { Button, Card, Donut, Empty, Kpi, Title } from "@/components/common";
import { ReportDownload } from "@/components/ReportDownload";
import { money, number } from "@/lib/format";

export function Portfolio() {
  const { state, setState, demo } = useApp(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [sort, setSort] = useState("currentValue"),
    [fileError, setFileError] = useState(""),
    [notice, setNotice] = useState("");
  const [newSymbol, setNewSymbol] = useState(""),
    [newValue, setNewValue] = useState("");
  const alloc = assetAllocation(state.holdings),
    total = portfolioTotal(state.holdings),
    correlationData = demo
      ? null
      : calculateReturnCorrelations(state.historicalReturns),
    correlationMatrix = demo
      ? SYNTHETIC_CORRELATIONS
      : (correlationData?.values ?? null),
    correlationCounts = demo
      ? null
      : (correlationData?.pairObservationCounts ?? null),
    hasMeasuredCorrelations =
      demo ||
      Boolean(
        correlationMatrix?.some((row, i) =>
          row.some((value, j) => i !== j && value !== null)
        )
      ),
    div = scoreDiversification(state.holdings, correlationMatrix ?? undefined);
  let filtered = state.holdings.filter(
    h =>
      (h.name + h.symbol + h.sector)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All" || assetBucketFor(h) === filter)
  );
  filtered = [...filtered].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : Number(b[sort as keyof Holding]) - Number(a[sort as keyof Holding])
  );
function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
  const f = e.target.files?.[0];
  if (!f) return;

  setFileError("");

  if (!/\.csv$/i.test(f.name)) {
    setFileError("Choose a .csv file.");
    e.target.value = "";
    return;
  }

  if (f.size > 2 * 1024 * 1024) {
    setFileError("CSV must be under 2 MB.");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const parsed = parseHoldingsCSV(String(reader.result || ""));
    setFileError(parsed.errors.join(" "));

    if (!parsed.holdings.length) {
      setNotice("No valid holdings found in the CSV.");
      return;
    }

    const existingIds = new Set(state.holdings.map((holding) => holding.id));

    const newHoldings = parsed.holdings.filter(
      (holding) => !existingIds.has(holding.id)
    );

    if (newHoldings.length === 0) {
      setNotice("No new holdings imported; these holdings already exist.");
      return;
    }

    setState({
      ...state,
      holdings: [...state.holdings, ...newHoldings],
      dataOrigin: demo ? "demo" : "import",
    });

    setNotice(
      `${newHoldings.length} new holding(s) imported; ${
        parsed.holdings.length - newHoldings.length
      } duplicate(s) skipped; rows with errors were skipped.`
    );
  };

  reader.onerror = () => {
    setFileError("Unable to read the CSV file. Please try again.");
  };

  reader.readAsText(f);
  e.target.value = "";
}

  function add() {
    if (!newSymbol || !Number(newValue)) return;
    const h: Holding = {
      id: `manual-${Date.now()}`,
      symbol: newSymbol.toUpperCase(),
      name: newSymbol.toUpperCase(),
      assetType: "Equity",
      sector: "Unspecified",
      geography: "India",
      marketCap: "Not specified",
      quantity: 1,
      averagePrice: Number(newValue),
      currentPrice: Number(newValue),
      currentValue: Number(newValue),
    };
    setState({
      ...state,
      holdings: [...state.holdings, h],
      dataOrigin: demo ? "demo" : "manual",
    });
    setNewSymbol("");
    setNewValue("");
    setNotice("Holding added to this workspace.");
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="PORTFOLIO ANALYTICS"
          title="Your holdings, in context."
          sub="Search, compare and review exposure. Demo holdings are fictional; imported values are user supplied."
        />
        <ReportDownload state={state} section="holdings" title="Holdings report" scopes={[{ value: "all", label: "All holdings" }, ...state.holdings.map(h => ({ value: h.id, label: h.symbol }))]} />
      </div>
      <div className="kpi-grid compact">
        <Kpi
          label="Portfolio value"
          value={money(total)}
          detail={`${state.holdings.length} holdings`}
          icon={Wallet}
        />
        <Kpi
          label="Largest asset class"
          value={
            Object.entries(alloc).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
          }
          detail={
            total
              ? `${((Math.max(...Object.values(alloc)) / total) * 100) | 0}% of current value`
              : "No holdings yet"
          }
          icon={Layers}
        />
        <Kpi
          label="Diversification method score"
          value={`${div.total}/100`}
          detail={`${div.coveragePct}% methodology-weight coverage · not official`}
          icon={Activity}
        />
      </div>
      {notice && <p className="success-box">{notice}</p>}
      <div className="portfolio-grid">
        <Card>
          <div className="card-heading">
            <div>
              <span className="eyebrow">HOLDINGS</span>
              <h2>Current positions</h2>
            </div>
            <label className="button outline upload-button">
              <Upload size={16} /> Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={importCsv}
                aria-label="Import holdings from CSV"
              />
            </label>
          </div>
          {fileError && (
            <p className="error-box" role="alert">
              {fileError}
            </p>
          )}
          <div className="toolbar">
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Search holdings"
                placeholder="Search name, ticker, sector"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter asset bucket"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option>All</option>
              {["Equity", "Mutual Funds", "Gold", "Debt", "Cash"].map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort holdings"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              <option value="currentValue">Sort by value</option>
              <option value="name">Sort by name</option>
              <option value="quantity">Sort by quantity</option>
            </select>
          </div>
          {state.holdings.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Asset type</th>
                    <th>Sector</th>
                    <th>Units</th>
                    <th>Avg. price</th>
                    <th>Current value</th>
                    <th>Gain / loss</th>
                    <th>Weight</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h => {
                    const gain = (h.currentPrice - h.averagePrice) * h.quantity;
                    return (
                      <tr key={h.id}>
                        <td>
                          <b>{h.symbol}</b>
                          <small>{h.name}</small>
                        </td>
                        <td>{h.assetType}</td>
                        <td>{h.sector}</td>
                        <td>{number(h.quantity)}</td>
                        <td>{money(h.averagePrice)}</td>
                        <td>
                          <b>{money(h.currentValue)}</b>
                        </td>
                        <td className={gain >= 0 ? "positive" : "negative"}>
                          {gain >= 0 ? "+" : "−"}
                          {money(Math.abs(gain))}
                        </td>
                        <td>
                          {total
                            ? ((h.currentValue / total) * 100).toFixed(1)
                            : 0}
                          %
                        </td>
                        <td>
                          <button
                            className="icon-btn danger"
                            aria-label={`Remove ${h.name}`}
                            onClick={() =>
                              setState({
                                ...state,
                                holdings: state.holdings.filter(
                                  x => x.id !== h.id
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="note">No holdings match the current search.</p>
              )}
            </div>
          ) : (
            <Empty
              title="No holdings yet"
              body="Add one position or import CSV. Imported values stay in this browser unless you are signed in."
            />
          )}
          <details className="methodology">
            <summary>About this diversification score</summary>
            <p>
              Methodology only (not an official rating): asset class 30%, sector
              20%, security concentration 20%, correlation 20%, geography 10%.
              In an empty portfolio the score is 0. Correlation observations in
              demo mode are synthetic.
            </p>
          </details>
        </Card>
        <Card>
          <span className="eyebrow">ADD A POSITION</span>
          <h2>Manual holding</h2>
          <form
            className="manual-form"
            onSubmit={e => {
              e.preventDefault();
              add();
            }}
          >
            <label>
              Symbol or name
              <input
                value={newSymbol}
                onChange={e => setNewSymbol(e.target.value)}
                placeholder="e.g. NIFTYBEES"
                required
              />
            </label>
            <label>
              Current value (₹)
              <input
                type="number"
                min="1"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                required
              />
            </label>
            <Button type="submit">
              <Plus size={16} /> Add holding
            </Button>
          </form>
          <p className="note">
            Manual holding is treated as one unit. Add detailed units and cost
            basis by CSV.
          </p>
          <hr />
          <h3>Allocation overview</h3>
          <Donut
            data={Object.entries(alloc).map(([name, v]) => ({
              name,
              value: total ? (v / total) * 100 : 0,
            }))}
          />
        </Card>
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">EXPOSURE CHECK</span>
            <h2>Concentration, without a verdict</h2>
          </div>
          <Link href="/ai-coach">
            Ask Coach <ArrowRight size={14} />
          </Link>
        </div>
        <div className="stat-row">
          {[1, 3, 5].map(n => {
            const share =
              (state.holdings
                .slice()
                .sort((a, b) => b.currentValue - a.currentValue)
                .slice(0, n)
                .reduce((s, h) => s + h.currentValue, 0) /
                (total || 1)) *
              100;
            return (
              <div key={n}>
                <b>Top {n}</b>
                <strong>
                  {state.holdings.length ? share.toFixed(1) : "0.0"}%
                </strong>
                <small>of portfolio value</small>
              </div>
            );
          })}
          <div>
            <b>Equity concentration</b>
            <strong>
              {total
                ? (
                    ((alloc.Equity + alloc["Mutual Funds"]) / total) *
                    100
                  ).toFixed(1)
                : "0.0"}
              %
            </strong>
            <small>Equity + mutual funds</small>
          </div>
        </div>
        <div className="hhi-summary">
          <div>
            <span>Security HHI</span>
            <strong>
              {div.concentration.holdingHHI === null
                ? "Unavailable"
                : div.concentration.holdingHHI.toFixed(4)}
            </strong>
            <small>
              0–1 concentration measure · {div.concentration.holdingHHI10k === null
                ? "—"
                : `${Math.round(div.concentration.holdingHHI10k).toLocaleString("en-IN")} / 10,000`}
            </small>
          </div>
          <div>
            <span>Sector HHI</span>
            <strong>
              {div.concentration.sectorHHI === null
                ? "Unavailable"
                : div.concentration.sectorHHI.toFixed(4)}
            </strong>
            <small>
              Effective holdings ≈ {div.concentration.effectiveHoldings === null
                ? "—"
                : div.concentration.effectiveHoldings.toFixed(1)}
            </small>
          </div>
        </div>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">
              {demo
                ? "DEMO-ONLY SYNTHETIC MATRIX"
                : hasMeasuredCorrelations
                  ? "USER-UPLOADED · UNVERIFIED"
                  : "CORRELATION UNAVAILABLE"}
            </span>
            <h2>
              {demo
                ? "Illustrative bucket correlations"
                : "Measured bucket correlations"}
            </h2>
            <p>
              {demo
                ? "Synthetic values; −1 to +1. Not observed market correlations."
                : hasMeasuredCorrelations
                  ? `Pairwise Pearson correlations from complete monthly observations; minimum 12 per pair. ${correlationData?.startMonth || ""}–${correlationData?.endMonth || ""}.`
                  : "No measured correlation is inferred. Upload at least 12 complete monthly return observations per pair to calculate a matrix."}
            </p>
          </div>
        </div>
        {correlationMatrix && hasMeasuredCorrelations ? (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">Bucket</th>
                  {ASSET_BUCKETS.map(bucket => (
                    <th key={bucket} scope="col">{bucket}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASSET_BUCKETS.map((bucket, i) => (
                  <tr key={bucket}>
                    <th scope="row">{bucket}</th>
                    {correlationMatrix[i]!.map((value, j) => {
                      const observations = correlationCounts?.[i]?.[j] ?? null;
                      return (
                        <td
                          key={`${bucket}-${ASSET_BUCKETS[j]}`}
                          title={demo ? "Synthetic demo value" : `${observations ?? 0} pairwise complete months`}
                          aria-label={`${bucket} with ${ASSET_BUCKETS[j]}: ${value === null ? "unavailable" : value.toFixed(2)}${demo ? ", synthetic demo value" : `, ${observations ?? 0} complete monthly observations`}`}
                        >
                          {value === null ? "—" : value.toFixed(2)}
                          {!demo && observations !== null && <small>{observations}m</small>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No observed matrix yet"
            body="No synthetic values are substituted for an account. Upload complete monthly return data to calculate correlations."
            action={<Button href="/backtest">Upload monthly returns</Button>}
          />
        )}
        <p className="note">
          {demo
            ? "Illustrative synthetic correlations are demo-only, not predictive and not an official rating component."
            : hasMeasuredCorrelations
              ? "Correlations are descriptive pairwise Pearson calculations on user-uploaded, unverified returns; missing rows are excluded per pair. They are not predictive."
              : "The correlation component is excluded from the diversification score until sufficient measured pairs exist; displayed coverage shows the available score weight."}
        </p>
        <div className="card-heading sector-heading">
          <div>
            <span className="eyebrow">CURRENT SECTOR EXPOSURE</span>
            <h2>Sector mix</h2>
          </div>
        </div>
        <div className="sector-list">
          {[
            ...state.holdings.reduce(
              (m, h) =>
                m.set(h.sector, (m.get(h.sector) || 0) + h.currentValue),
              new Map<string, number>()
            ),
          ]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([sector, value]) => (
              <div key={sector}>
                <span>{sector}</span>
                <i>
                  <b
                    style={{ width: `${total ? (value / total) * 100 : 0}%` }}
                  />
                </i>
                <strong>
                  {total ? ((value / total) * 100).toFixed(1) : "0.0"}%
                </strong>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}
