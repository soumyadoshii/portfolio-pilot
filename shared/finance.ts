import {
  ASSET_BUCKETS,
  type Allocation,
  type AssetBucket,
  type Goal,
  type Holding,
  type PortfolioReport,
  type PortfolioState,
  type RiskProfile,
  type StressScenario,
  type StressResult,
} from "./portfolio";

import type { BacktestResult } from "./backtest";

export function assetBucketFor(h: Pick<Holding, "assetType">): AssetBucket {
  switch (h.assetType) {
    case "Equity":
      return "Equity";
    case "Mutual Fund":
      return "Mutual Funds";
    case "ETF":
      return "Mutual Funds";
    case "Gold":
      return "Gold";
    case "Debt":
      return "Debt";
    case "Cash":
      return "Cash";
  }
}
export function holdingValue(
  h: Pick<Holding, "currentValue" | "quantity" | "currentPrice">
): number {
  return Number.isFinite(h.currentValue) && h.currentValue >= 0
    ? h.currentValue
    : h.quantity * h.currentPrice;
}
export function portfolioTotal(holdings: Holding[]): number {
  return holdings.reduce((s, h) => s + holdingValue(h), 0);
}
export function assetAllocation(holdings: Holding[]): Allocation {
  const a: Allocation = {
      Equity: 0,
      "Mutual Funds": 0,
      Gold: 0,
      Debt: 0,
      Cash: 0,
    },
    total = portfolioTotal(holdings);
  holdings.forEach(h => (a[assetBucketFor(h)] += holdingValue(h)));
  return total
    ? a
    : (Object.fromEntries(ASSET_BUCKETS.map(k => [k, 0])) as Allocation);
}
export interface GoalProjection {
  months: number;
  years: number;
  targetInflationAdjusted: number;
  projectedCorpus: number;
  requiredMonthlyContribution: number | null;
  shortfall: number;
  surplus: number;
  progressPct: number;
  status: "On Track" | "Needs Attention" | "Behind";
  assumedMonthlyRate: number;
}
export function goalProjection(goal: Goal, asOf = new Date()): GoalProjection {
  const end = new Date(goal.targetDate + "T00:00:00"),
    rawMonths = Math.ceil(
      (end.getTime() - asOf.getTime()) / (30.4375 * 86400000)
    ),
    months = Number.isFinite(rawMonths) ? Math.max(0, rawMonths) : 0,
    years = months / 12,
    inflation = Math.max(-1, Math.min(1, goal.inflationPct / 100)),
    annualReturn = Math.max(-1, Math.min(1, goal.expectedReturnPct / 100)),
    target = goal.targetAmount * Math.pow(1 + inflation, years),
    rm = Math.pow(1 + annualReturn, 1 / 12) - 1,
    growth = Math.pow(1 + rm, months),
    fv =
      goal.currentAmount * growth +
      goal.monthlyContribution *
        (months ? (Math.abs(rm) < 1e-12 ? months : (growth - 1) / rm) : 0),
    need =
      months === 0
        ? target <= goal.currentAmount
          ? 0
          : null
        : Math.max(
            0,
            Math.abs(rm) < 1e-12
              ? (target - goal.currentAmount) / months
              : ((target - goal.currentAmount * growth) * rm) / (growth - 1)
          );
  // Treat float rounding noise (about 1e-16 relative) as "target met", so saving
  // exactly the required contribution reads On Track.
  const gap = target - fv,
    met = gap <= 1e-9 * Math.max(1, Math.abs(target)),
    ratio = target ? fv / target : 1,
    status = met
      ? "On Track"
      : ratio >= 0.75
        ? "Needs Attention"
        : "Behind";
  return {
    months,
    years,
    targetInflationAdjusted: target,
    projectedCorpus: fv,
    requiredMonthlyContribution: need,
    shortfall: met ? 0 : Math.max(0, gap),
    surplus: Math.max(0, fv - target),
    progressPct: goal.targetAmount
      ? Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)
      : 0,
    status,
    assumedMonthlyRate: rm,
  };
}
const clamp = (x: number, a = 0, b = 100) => Math.max(a, Math.min(b, x));
export interface DiversificationScore {
  total: number;
  coveragePct: number;
  breakdown: {
    assetClass: number;
    sector: number;
    securityConcentration: number;
    correlation: number | null;
    geography: number;
  };
  concentration: {
    holdingHHI: number | null;
    holdingHHI10k: number | null;
    effectiveHoldings: number | null;
    sectorHHI: number | null;
    sectorHHI10k: number | null;
    topThreeWeightPct: number;
  };
  weights: {
    assetClass: 30;
    sector: 20;
    securityConcentration: 20;
    correlation: 20;
    geography: 10;
  };
}
export function scoreDiversification(
  holdings: Holding[],
  correlations?: Array<Array<number | null>>
): DiversificationScore {
  const total = portfolioTotal(holdings);
  if (!holdings.length || !total)
    return {
      total: 0,
      coveragePct: 0,
      breakdown: {
        assetClass: 0,
        sector: 0,
        securityConcentration: 0,
        correlation: null,
        geography: 0,
      },
      concentration: {
        holdingHHI: null,
        holdingHHI10k: null,
        effectiveHoldings: null,
        sectorHHI: null,
        sectorHHI10k: null,
        topThreeWeightPct: 0,
      },
      weights: {
        assetClass: 30,
        sector: 20,
        securityConcentration: 20,
        correlation: 20,
        geography: 10,
      },
    };
  const groupWeights = (key: (h: Holding) => string) => {
    const g = new Map<string, number>();
    holdings.forEach(h => {
      const group = key(h).trim().toLowerCase() || "unknown";
      g.set(group, (g.get(group) || 0) + holdingValue(h) / total);
    });
    return g;
  };
  const scoreDistribution = (groups: Map<string, number>) => {
    const n = groups.size,
      hhi = [...groups.values()].reduce((sum, weight) => sum + weight ** 2, 0);
    return clamp(n <= 1 ? 0 : ((1 - hhi) / (1 - 1 / n)) * 100);
  };
  const securities = groupWeights(h => h.symbol || h.name),
    sectors = groupWeights(h => h.sector || "Unknown"),
    holdingHHI = [...securities.values()].reduce(
      (sum, weight) => sum + weight ** 2,
      0
    ),
    sectorHHI = [...sectors.values()].reduce(
      (sum, weight) => sum + weight ** 2,
      0
    ),
    topThreeWeightPct =
      [...securities.values()]
        .sort((a, b) => b - a)
        .slice(0, 3)
        .reduce((sum, weight) => sum + weight, 0) *
      100;
  let corrScore: number | null = null,
    observedCorrelationPairs = 0,
    possibleCorrelationPairs = 0;
  if (correlations?.length) {
    const vals: number[] = [];
    possibleCorrelationPairs =
      (correlations.length * Math.max(0, correlations.length - 1)) / 2;
    for (let i = 0; i < correlations.length; i++)
      for (let j = i + 1; j < (correlations[i]?.length || 0); j++) {
        const value = correlations[i]?.[j];
        if (typeof value === "number" && Number.isFinite(value))
          vals.push(value);
      }
    if (vals.length)
      corrScore = clamp(
        100 -
          (vals.reduce((sum, value) => sum + Math.abs(value), 0) / vals.length) *
            100
      );
    observedCorrelationPairs = vals.length;
  }
  const parts = {
    assetClass: scoreDistribution(groupWeights(h => assetBucketFor(h))),
    sector: scoreDistribution(sectors),
    securityConcentration: scoreDistribution(securities),
    correlation: corrScore,
    geography: scoreDistribution(groupWeights(h => h.geography || "Unknown")),
  };
  const correlationWeight =
      corrScore === null || !possibleCorrelationPairs
        ? 0
        : 20 * (observedCorrelationPairs / possibleCorrelationPairs),
    availableWeight = 80 + correlationWeight,
    weightedTotal =
      parts.assetClass * 30 +
      parts.sector * 20 +
      parts.securityConcentration * 20 +
      (parts.correlation ?? 0) * correlationWeight +
      parts.geography * 10;
  return {
    total: Math.round(weightedTotal / availableWeight),
    coveragePct: Math.round(availableWeight),
    breakdown: parts,
    concentration: {
      holdingHHI,
      holdingHHI10k: holdingHHI * 10_000,
      effectiveHoldings: holdingHHI > 0 ? 1 / holdingHHI : null,
      sectorHHI,
      sectorHHI10k: sectorHHI * 10_000,
      topThreeWeightPct,
    },
    weights: {
      assetClass: 30,
      sector: 20,
      securityConcentration: 20,
      correlation: 20,
      geography: 10,
    },
  };
}
export function scenarioCatalog(): StressScenario[] {
  return [
    {
      id: "gfc",
      name: "2008-style equity crisis",
      description:
        "Severe global risk-off sensitivity; illustrative, not a replay.",
      returnsPct: {
        Equity: -48,
        "Mutual Funds": -34,
        Gold: 8,
        Debt: 3,
        Cash: 0,
      },
      recoveryMonths: 42,
      isCustom: false,
    },
    {
      id: "covid",
      name: "COVID-style shock",
      description: "Sudden equity drawdown with uncertain recovery.",
      returnsPct: {
        Equity: -32,
        "Mutual Funds": -25,
        Gold: 10,
        Debt: 1,
        Cash: 0,
      },
      recoveryMonths: 18,
      isCustom: false,
    },
    {
      id: "taper",
      name: "2013-style taper tantrum",
      description: "Rate repricing pressure across risk assets and bonds.",
      returnsPct: {
        Equity: -18,
        "Mutual Funds": -13,
        Gold: -17,
        Debt: -7,
        Cash: 0,
      },
      recoveryMonths: 16,
      isCustom: false,
    },
    {
      id: "inflation",
      name: "Persistent inflation shock",
      description: "Purchasing-power pressure and mixed asset sensitivity.",
      returnsPct: {
        Equity: -12,
        "Mutual Funds": -8,
        Gold: 14,
        Debt: -9,
        Cash: -3,
      },
      recoveryMonths: 20,
      isCustom: false,
    },
    {
      id: "rates",
      name: "Interest-rate shock",
      description: "Hypothetical rapid upward repricing in borrowing costs.",
      returnsPct: {
        Equity: -16,
        "Mutual Funds": -11,
        Gold: -5,
        Debt: -8,
        Cash: 0,
      },
      recoveryMonths: 18,
      isCustom: false,
    },
    {
      id: "correction",
      name: "Broad equity correction",
      description: "Hypothetical 20% equity decline.",
      returnsPct: {
        Equity: -20,
        "Mutual Funds": -14,
        Gold: 3,
        Debt: 1,
        Cash: 0,
      },
      recoveryMonths: 14,
      isCustom: false,
    },
    {
      id: "stagflation",
      name: "Stagflation pressure",
      description:
        "Slow growth and sticky inflation; illustrative assumptions.",
      returnsPct: {
        Equity: -25,
        "Mutual Funds": -18,
        Gold: 12,
        Debt: -7,
        Cash: -2,
      },
      recoveryMonths: 30,
      isCustom: false,
    },
  ];
}
export function calculateStress(
  holdings: Holding[],
  scenario: StressScenario,
  goals: Goal[] = []
): StressResult {
  const impacts = holdings.map(h => {
    const before = holdingValue(h),
      pct = scenario.returnsPct[assetBucketFor(h)] ?? 0,
      change = (before * pct) / 100;
    return {
      holdingId: h.id,
      name: h.name,
      symbol: h.symbol,
      beforeValue: before,
      changeValue: change,
      afterValue: before + change,
    };
  });
  const before = impacts.reduce((s, x) => s + x.beforeValue, 0),
    after = impacts.reduce((s, x) => s + x.afterValue, 0);
  const goalImpacts = goals.map(g => {
    const beforeCorpus = g.currentAmount,
      share = before ? beforeCorpus / before : 0,
      afterCorpus = beforeCorpus + (after - before) * share,
      p = goalProjection({ ...g, currentAmount: afterCorpus });
    return {
      goalId: g.id,
      goalName: g.name,
      beforeCorpus,
      afterCorpus,
      additionalMonthlyContribution:
        p.requiredMonthlyContribution === null
          ? null
          : Math.max(
              0,
              p.requiredMonthlyContribution - g.monthlyContribution
            ),
    };
  });
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    assumptions: { ...scenario.returnsPct },
    beforeValue: before,
    afterValue: after,
    changeValue: after - before,
    lossPct: before ? ((before - after) / before) * 100 : 0,
    recoveryMonths: scenario.recoveryMonths,
    holdingImpacts: impacts,
    goalImpacts,
    createdAt: new Date().toISOString(),
  };
}
export interface AllocationReviewRow {
  bucket: AssetBucket;
  currentPct: number;
  targetPct: number;
  driftPct: number;
  outsideTolerance: boolean;
  adjustmentValue: number;
}
export function allocationReview(
  holdings: Holding[],
  targets: Allocation,
  tolerances: Record<AssetBucket, number>
): AllocationReviewRow[] {
  const total = portfolioTotal(holdings),
    alloc = assetAllocation(holdings);
  return ASSET_BUCKETS.map(bucket => {
    const currentPct = total ? (alloc[bucket] / total) * 100 : 0,
      targetPct = targets[bucket] ?? 0,
      driftPct = currentPct - targetPct;
    return {
      bucket,
      currentPct,
      targetPct,
      driftPct,
      outsideTolerance: Math.abs(driftPct) > (tolerances[bucket] ?? 0),
      adjustmentValue: (total * (targetPct - currentPct)) / 100,
    };
  });
}
export function weatherExposure(holdings: Holding[]) {
  const total = portfolioTotal(holdings) || 1;
  const rows = holdings.map(h => {
    const bucket = assetBucketFor(h),
      sector = h.sector.toLowerCase();
    let growth = 0,
      inflation = 0,
      deflation = 0,
      recession = 0,
      defensive = 0;
    if (bucket === "Equity" || bucket === "Mutual Funds") {
      growth =
        sector.includes("technology") || sector.includes("industr") ? 1 : 0.75;
      inflation =
        sector.includes("energy") || sector.includes("materials") ? 0.65 : 0.2;
      deflation = 0.25;
      recession = 0.25;
    }
    if (bucket === "Gold") {
      inflation = 1;
      deflation = 0.25;
      recession = 0.55;
      defensive = 0.65;
    }
    if (bucket === "Debt") {
      deflation = 0.65;
      recession = 0.6;
      defensive = 0.8;
      inflation = 0.2;
    }
    if (bucket === "Cash") {
      deflation = 0.35;
      recession = 0.6;
      defensive = 1;
    }
    return {
      value: holdingValue(h),
      growth,
      inflation,
      deflation,
      recession,
      defensive,
    };
  });
  const keys = [
    "growth",
    "inflation",
    "deflation",
    "recession",
    "defensive",
  ] as const;
  return Object.fromEntries(
    keys.map(k => [
      k,
      (rows.reduce((s, r) => s + r.value * r[k], 0) / total) * 100,
    ])
  ) as Record<(typeof keys)[number], number>;
}
export function riskProfileFromAnswers(answers: number[]): {
  profile: RiskProfile;
  score: number;
} {
  const score = answers.length
    ? Math.round(
        (answers.reduce((a, b) => a + clamp(b, 0, 4), 0) / answers.length / 4) *
          100
      )
    : 0;
  return {
    score,
    profile:
      score < 25
        ? "Conservative"
        : score < 50
          ? "Moderate"
          : score < 75
            ? "Growth"
            : "Aggressive",
  };
}
function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(x => x)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell.trim());
  if (row.some(x => x)) rows.push(row);
  return rows;
}
export interface CsvParseResult {
  holdings: Holding[];
  errors: string[];
}

function stableHoldingId(identity: string): string {
  // Two deterministic 32-bit hashes keep IDs stable across imports.
  const hash = (seed: number) => {
    let value = seed;

    for (let i = 0; i < identity.length; i++) {
      value ^= identity.charCodeAt(i);
      value = Math.imul(value, 16777619);
    }

    return (value >>> 0).toString(36);
  };

  return `csv-${hash(2166136261)}-${hash(3339675911)}`;
}

export function parseHoldingsCSV(csv: string): CsvParseResult {
  let rows: string[][];

  try {
    rows = parseCsvRows(csv.replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      holdings: [],
      errors: [
        error instanceof Error
          ? error.message
          : "CSV could not be parsed.",
      ],
    };
  }

  if (rows.length < 2) {
    return {
      holdings: [],
      errors: ["Add a header row and at least one holding row."],
    };
  }

  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]/g, "");

  const headers = rows[0].map(normalize);
  const errors: string[] = [];

  if (headers.some(header => !header)) {
    return {
      holdings: [],
      errors: ["CSV contains an empty column header."],
    };
  }

  if (new Set(headers).size !== headers.length) {
    return {
      holdings: [],
      errors: ["CSV contains duplicate column headers."],
    };
  }

  const find = (aliases: string[]) =>
    headers.findIndex(header =>
      aliases.some(alias => normalize(alias) === header)
    );

  const sym = find([
      "symbol", "ticker", "stock", "security", "instrument",
    ]);
  const val = find([
      "current value", "market value", "value", "amount",
    ]);
  const name = find(["name", "company", "description"]);
  const type = find(["asset type", "type", "asset"]);
  const sector = find(["sector"]);
  const qty = find(["quantity", "units", "qty"]);
  const avg = find(["average price", "avg price", "cost basis"]);

  if (sym < 0) {
    errors.push(
      "Missing symbol column; use symbol, ticker, stock, security or instrument."
    );
  }

  if (val < 0) {
    errors.push(
      "Missing current value column; use current value, market value, value or amount."
    );
  }

  if (sym < 0 || val < 0) {
    return { holdings: [], errors };
  }

  const output: Holding[] = [];
  const seen = new Set<string>();

  const parseNumber = (raw: string, currency = false) => {
    const cleaned = currency
      ? raw.replace(/[₹,\s]/g, "")
      : raw.replace(/[,\s]/g, "");

    if (!cleaned || !/^-?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) {
      return null;
    }

    const value = Number(cleaned);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };

  rows.slice(1).forEach((r, index) => {
    const rowNo = index + 2;

    if (r.length !== headers.length) {
      errors.push(
        `Row ${rowNo}: expected ${headers.length} columns but found ${r.length}.`
      );
      return;
    }

    const symbol = r[sym]?.trim().toUpperCase();
    const currentValue = parseNumber(r[val] ?? "", true);

    if (!symbol || !/^[A-Z0-9][A-Z0-9.&_-]*$/.test(symbol)) {
      errors.push(`Row ${rowNo}: symbol is missing or invalid.`);
      return;
    }

    if (currentValue === null) {
      errors.push(
        `Row ${rowNo}: current value must be a valid non-negative number.`
      );
      return;
    }

    const quantity =
      qty >= 0 ? parseNumber(r[qty] ?? "") : 0;
    const averagePrice =
      avg >= 0 ? parseNumber(r[avg] ?? "") : 0;

    if (quantity === null) {
      errors.push(
        `Row ${rowNo}: quantity must be a valid non-negative number.`
      );
      return;
    }

    if (averagePrice === null) {
      errors.push(
        `Row ${rowNo}: average price must be a valid non-negative number.`
      );
      return;
    }

    const nameVal = name >= 0 ? r[name]?.trim() : "";
    const asset = (
      type >= 0 ? r[type]?.trim() || "Equity" : "Equity"
    ).toLowerCase();

    let assetType: Holding["assetType"] = "Equity";

    if (asset.includes("mutual")) assetType = "Mutual Fund";
    else if (asset.includes("gold")) assetType = "Gold";
    else if (
      asset.includes("debt") ||
      asset.includes("bond") ||
      asset.includes("ppf")
    ) {
      assetType = "Debt";
    } else if (asset.includes("cash")) {
      assetType = "Cash";
    } else if (asset.includes("etf")) {
      assetType = "ETF";
    }

    const sectorValue =
      sector >= 0 ? r[sector]?.trim() || "Unspecified" : "Unspecified";

    // Identical position rows get the same ID on every import.
    // Different quantities or valuations remain distinct positions.
    const identity = JSON.stringify([
      symbol,
      assetType,
      quantity,
      averagePrice,
      currentValue,
    ]);

    if (seen.has(identity)) {
      errors.push(
        `Row ${rowNo}: duplicate holding entry for ${symbol}; skipped.`
      );
      return;
    }

    seen.add(identity);

    output.push({
      id: stableHoldingId(identity),
      symbol,
      name: nameVal || symbol,
      assetType,
      sector: sectorValue,
      geography: "India",
      marketCap: "Not specified",
      quantity,
      averagePrice,
      currentPrice: quantity > 0
        ? currentValue / quantity
        : currentValue,
      currentValue,
    });
  });

  return { holdings: output, errors };
}

export function generatePortfolioReport(
  state: PortfolioState,
  backtestResult: BacktestResult | null = null
): PortfolioReport {
  const total = portfolioTotal(state.holdings),
    allocation = assetAllocation(state.holdings),
    score = scoreDiversification(state.holdings),
    costBasis = state.holdings.reduce(
      (sum, h) => sum + h.quantity * h.averagePrice,
      0
    ),
    gainLoss = total - costBasis,
    gainLossPct = costBasis ? (gainLoss / costBasis) * 100 : null,
    goalMonthlyContributions = state.goals.reduce(
      (sum, g) => sum + g.monthlyContribution,
      0
    ),
    snapshots = state.snapshots.slice().sort((a, b) => a.date.localeCompare(b.date)),
    previousSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null,
    latestSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null,
    snapshotSummary =
      previousSnapshot && latestSnapshot
        ? `Saved snapshots moved from ₹${Math.round(previousSnapshot.totalValue).toLocaleString("en-IN")} (${previousSnapshot.label}) to ₹${Math.round(latestSnapshot.totalValue).toLocaleString("en-IN")} (${latestSnapshot.label}), a change of ₹${Math.round(latestSnapshot.totalValue - previousSnapshot.totalValue).toLocaleString("en-IN")}${previousSnapshot.totalValue ? ` (${(((latestSnapshot.totalValue - previousSnapshot.totalValue) / previousSnapshot.totalValue) * 100).toFixed(1)}%)` : ""}. Snapshot values are illustrative/user-entered, not market history.`
        : "Fewer than two saved snapshots are available, so no period-to-period portfolio change is calculated.",
    goalLines =
      state.goals
        .map(g => {
          const p = goalProjection(g),
            required =
              p.requiredMonthlyContribution === null
                ? "unavailable because the target date has arrived"
                : `₹${Math.round(p.requiredMonthlyContribution).toLocaleString("en-IN")}/month`;
          return `${g.name} (${g.category}): ${p.status}; ${p.progressPct.toFixed(1)}% progress; deterministic projected corpus ₹${Math.round(p.projectedCorpus).toLocaleString("en-IN")} versus inflation-adjusted target ₹${Math.round(p.targetInflationAdjusted).toLocaleString("en-IN")} by ${g.targetDate}; current goal contribution ₹${Math.round(g.monthlyContribution).toLocaleString("en-IN")}/month versus estimated required ${required}. This is not a probability.`;
        })
        .join(" ") || "No goals added yet.";
  const historicalSummary = !state.historicalReturns
    ? "No user-uploaded monthly return history is stored; no empirical performance or strategy comparison is shown."
    : !backtestResult || backtestResult.status !== "ready"
      ? `Historical return data is user-uploaded and unverified. No result is shown: ${backtestResult?.message || "save a valid comparison configuration and run the shared engine"}`
      : `User-uploaded, unverified ${backtestResult.source.returnBasis} bucket data (${backtestResult.source.sourceName}) covers the same complete monthly window ${backtestResult.source.commonStartMonth} to ${backtestResult.source.commonEndMonth} (${backtestResult.source.nObs} observations) for both strategies. Baseline CAGR ${backtestResult.baseline?.metrics.cagr.value === null ? "unavailable" : `${backtestResult.baseline?.metrics.cagr.value.toFixed(2)}%`}, volatility ${backtestResult.baseline?.metrics.annualizedVolatility.value === null ? "unavailable" : `${backtestResult.baseline?.metrics.annualizedVolatility.value.toFixed(2)}%`}, Sharpe ${backtestResult.baseline?.metrics.sharpeRatio.value === null ? "unavailable" : backtestResult.baseline?.metrics.sharpeRatio.value.toFixed(2)}, maximum drawdown ${backtestResult.baseline?.metrics.maximumDrawdown.value === null ? "unavailable" : `${backtestResult.baseline?.metrics.maximumDrawdown.value.toFixed(2)}%`}; All-Weather-inspired CAGR ${backtestResult.allWeather?.metrics.cagr.value === null ? "unavailable" : `${backtestResult.allWeather?.metrics.cagr.value.toFixed(2)}%`}, volatility ${backtestResult.allWeather?.metrics.annualizedVolatility.value === null ? "unavailable" : `${backtestResult.allWeather?.metrics.annualizedVolatility.value.toFixed(2)}%`}, Sharpe ${backtestResult.allWeather?.metrics.sharpeRatio.value === null ? "unavailable" : backtestResult.allWeather?.metrics.sharpeRatio.value.toFixed(2)}, maximum drawdown ${backtestResult.allWeather?.metrics.maximumDrawdown.value === null ? "unavailable" : `${backtestResult.allWeather?.metrics.maximumDrawdown.value.toFixed(2)}%`}. These are historical calculations on unverified uploads, not forecasts or recommendations.`;
  const rebalanceReview = allocationReview(
      state.holdings,
      state.allocationTargets,
      state.tolerancesPct
    ),
    outsideTolerance = rebalanceReview.filter(row => row.outsideTolerance),
    rebalanceSummary = outsideTolerance.length
      ? `Review-only drift outside saved tolerance: ${outsideTolerance
          .map(
            row =>
              `${row.bucket} ${row.driftPct > 0 ? "+" : ""}${row.driftPct.toFixed(1)} pp; illustrative value adjustment ${row.adjustmentValue < 0 ? "−" : "+"}₹${Math.round(Math.abs(row.adjustmentValue)).toLocaleString("en-IN")}`
          )
          .join("; ")}. This is not a trade instruction.`
      : "No asset bucket currently exceeds its saved percentage-point tolerance; no review adjustment is suggested.";
  return {
    id: `report-${Date.now()}`,
    createdAt: new Date().toISOString(),
    title: "Portfolio review",
    commentarySource: "deterministic",
    sections: [
      {
        heading: "Where You Are",
        body: `Current ${state.dataOrigin === "demo" ? "synthetic demo" : "entered"} portfolio value is ₹${Math.round(total).toLocaleString("en-IN")}. Unrealized gain/loss estimate is ₹${Math.round(gainLoss).toLocaleString("en-IN")}${gainLossPct === null ? " (cost basis unavailable)" : ` (${gainLossPct.toFixed(1)}% of entered average-price cost basis)`}. Portfolio Risk Profile: ${state.profile.riskProfile || "Not set"} (self-reported/educational). Diversification methodology score: ${score.total}/100 using ${score.coveragePct}% of the specified score weights; this is not an official rating. Profile monthly investment: ₹${Math.round(state.profile.monthlyInvestment).toLocaleString("en-IN")}; saved goal contributions: ₹${Math.round(goalMonthlyContributions).toLocaleString("en-IN")}/month.`,
      },
      { heading: "Historical Performance Comparison", body: historicalSummary },
      { heading: "Where You Need To Be", body: goalLines },
      {
        heading: "What Changed",
        body: `${snapshotSummary} Current allocation — equity ${allocation.Equity.toFixed(1)}%, mutual funds ${allocation["Mutual Funds"].toFixed(1)}%, gold ${allocation.Gold.toFixed(1)}%, debt ${allocation.Debt.toFixed(1)}%, cash ${allocation.Cash.toFixed(1)}%.`,
      },
      {
        heading: "Allocation & Rebalance Review",
        body: `${rebalanceSummary} Values are based on current totals and saved targets/tolerances; taxes, transaction costs and security-level constraints are excluded.`,
      },
      {
        heading: "One Thing To Consider",
        body: state.holdings.length
          ? `Review whether concentration and your monthly contributions still match your goals; no trade is implied. ${(() => {
              const top = state.holdings
                .slice()
                .sort((a, b) => b.currentValue - a.currentValue)[0];
              return top && total
                ? `Largest holding is ${((top.currentValue / total) * 100).toFixed(1)}% of current value.`
                : "";
            })()}`
          : "Add holdings or import a CSV to make this review relevant to your portfolio.",
      },
      {
        heading: "Stress Snapshot",
        body: state.stressResult
          ? `${state.stressResult.scenarioName}: estimated change ₹${Math.round(state.stressResult.changeValue).toLocaleString("en-IN")}.`
          : "Run a scenario to view an illustrative shock impact.",
      },
      {
        heading: "Assumptions",
        body: `Goal projections compound monthly with end-of-month contribution timing and the entered annual return/inflation assumptions. Deterministic projections are not probabilities. ${backtestResult?.status === "ready" ? `${backtestResult.assumptions.costMethod} Flat costs exclude setup/entry costs, tax, brokerage-specific charges, slippage and market impact. ${backtestResult.assumptions.survivorshipLimitations}` : "No historical return is invented; uploaded data, if present, remains unverified."} Synthetic demo values and stress assumptions are illustrative, not predictions.`,
      },
      {
        heading: "Disclaimer",
        body: "PortfolioPilot is an educational and analytical prototype. Simulations and recommendations are illustrative and do not constitute personalized investment advice or a guarantee of future returns.",
      },
    ],
  };
}
export function deterministicCoachAnswer(
  question: string,
  state: PortfolioState,
  backtestResult: BacktestResult | null = null
): string {
  const q = question.toLowerCase(),
    total = portfolioTotal(state.holdings),
    allocation = assetAllocation(state.holdings),
    score = scoreDiversification(state.holdings),
    money = (x: number) => `₹${Math.round(x).toLocaleString("en-IN")}`;
  if (
    q.includes("backtest") ||
    q.includes("historical return") ||
    q.includes("cagr") ||
    q.includes("sharpe") ||
    q.includes("drawdown")
  ) {
    if (!state.historicalReturns)
      return "No user-uploaded monthly return history is available, so I cannot report historical performance, correlations or strategy comparisons. Upload a complete monthly dataset to calculate them; I will not invent returns.";
    if (!backtestResult || backtestResult.status !== "ready")
      return `The stored user-uploaded history is unverified and cannot currently support a complete comparison: ${backtestResult?.message || "select valid settings and calculate the shared comparison first"}`;
    const baseline = backtestResult.baseline!,
      allWeather = backtestResult.allWeather!,
      show = (value: number | null, suffix = "%") =>
        value === null ? "unavailable" : `${value.toFixed(2)}${suffix}`;
    return `On the same complete user-uploaded, unverified monthly window (${backtestResult.source.commonStartMonth} to ${backtestResult.source.commonEndMonth}; ${backtestResult.source.nObs} observations), baseline CAGR is ${show(baseline.metrics.cagr.value)} and All-Weather-inspired CAGR is ${show(allWeather.metrics.cagr.value)}; annualized volatility is ${show(baseline.metrics.annualizedVolatility.value)} versus ${show(allWeather.metrics.annualizedVolatility.value)}; Sharpe is ${show(baseline.metrics.sharpeRatio.value, "")} versus ${show(allWeather.metrics.sharpeRatio.value, "")}; max drawdown is ${show(baseline.metrics.maximumDrawdown.value)} versus ${show(allWeather.metrics.maximumDrawdown.value)}. Transaction costs, risk-free assumption, return basis and survivorship limitations are shown in the report. These results describe the uploaded window and are not forecasts or recommendations.`;
  }
  if (
    q.includes("monthly") ||
    q.includes("each month") ||
    q.includes("per month") ||
    q.includes("sip") ||
    (q.includes("invest") && (q.includes("more") || q.includes("contribution")))
  ) {
    const profileMonthly = Math.max(0, state.profile.monthlyInvestment),
      goalMonthly = state.goals.reduce(
        (sum, goal) => sum + goal.monthlyContribution,
        0
      );
    return `Your profile lists ${money(profileMonthly)} per month for investing; saved goal contributions total ${money(goalMonthly)} per month. No additional amount or target goal was specified, so I have not modeled a what-if. Tell me the extra monthly amount and the goal to compare an illustrative projection using that goal's assumptions.`;
  }
  if (
    q.includes("changed") ||
    q.includes("change in") ||
    q.includes("history") ||
    q.includes("since")
  ) {
    const snapshots = state.snapshots
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    if (snapshots.length < 2)
      return `There are ${snapshots.length} saved portfolio snapshot${snapshots.length === 1 ? "" : "s"}; two are needed to calculate a period-to-period change. Current entered holding value is ${money(total)}. No change is inferred from missing history.`;
    const previous = snapshots[snapshots.length - 2]!,
      latest = snapshots[snapshots.length - 1]!,
      delta = latest.totalValue - previous.totalValue,
      pct = previous.totalValue ? (delta / previous.totalValue) * 100 : null;
    return `Between the saved ${previous.label} and ${latest.label} snapshots, recorded value moved from ${money(previous.totalValue)} to ${money(latest.totalValue)}: ${delta < 0 ? "−" : "+"}${money(Math.abs(delta))}${pct === null ? "" : ` (${pct < 0 ? "−" : "+"}${Math.abs(pct).toFixed(1)}%)`}. These snapshot values may be synthetic or user-entered; they are not a return calculation or market history.`;
  }
  if (!state.holdings.length)
    return "There are no holdings in this portfolio yet. Add sample/manual holdings or import a CSV to get a state-grounded explanation; no account connection is used.";
  if (q.includes("gold"))
    return `Gold is ${allocation.Gold.toFixed(1)}% of this synthetic portfolio (${money((total * allocation.Gold) / 100)}). Its role depends on your goals and risk tolerance; this is a descriptive exposure, not a target recommendation.`;
  if (q.includes("sector")) {
    const m = new Map<string, number>();
    state.holdings.forEach(h =>
      m.set(h.sector, (m.get(h.sector) || 0) + holdingValue(h))
    );
    const top = [...m].sort((a, b) => b[1] - a[1])[0];
    return `The largest named sector grouping is ${top?.[0] || "not specified"} at ${top ? ((top[1] / total) * 100).toFixed(1) : "0"}% of current value. Sector labels are supplied with the holdings and can be incomplete.`;
  }
  if (q.includes("goal")) {
    const first = state.goals[0];
    if (!first)
      return "No goals are on file. Create a goal with a target, date and contribution to see an illustrative projection.";
    const p = goalProjection(first);
    return `${first.name} is marked ${p.status}. Under a ${first.expectedReturnPct}% annual return and ${first.inflationPct}% inflation assumption, projected corpus is ${money(p.projectedCorpus)} versus an inflation-adjusted target of ${money(p.targetInflationAdjusted)}. This is not a forecast.`;
  }
  if (q.includes("shock") || q.includes("20%")) {
    const scen: StressScenario = {
      id: "coach-20",
      name: "User-requested 20% equity shock",
      description: "Illustrative sensitivity",
      returnsPct: {
        Equity: -20,
        "Mutual Funds": -14,
        Gold: 0,
        Debt: 0,
        Cash: 0,
      },
      recoveryMonths: 0,
      isCustom: true,
    };
    const r = calculateStress(state.holdings, scen, state.goals);
    return `Applying a -20% equity and -14% mutual-fund shock, with other buckets unchanged, gives an illustrative portfolio change of ${money(r.changeValue)} (${r.lossPct.toFixed(1)}%). Assumptions are percentage-point returns, not predictions.`;
  }
  return `Current ${state.dataOrigin === "demo" ? "synthetic demo" : "entered"} portfolio value is ${money(total)}. Allocation: equity ${allocation.Equity.toFixed(1)}%, mutual funds ${allocation["Mutual Funds"].toFixed(1)}%, gold ${allocation.Gold.toFixed(1)}%, debt ${allocation.Debt.toFixed(1)}%, cash ${allocation.Cash.toFixed(1)}%. Diversification methodology score ${score.total}/100 (${score.coveragePct}% methodology coverage; not official). More specific questions can explain sector exposure, goals, gold, backtesting or shocks.`;
}
