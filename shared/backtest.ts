import {
  ASSET_BUCKETS,
  type Allocation,
  type AssetBucket,
  type BacktestConfig,
  type HistoricalReturnDataset,
  type Holding,
  type MonthlyReturnObservation,
} from "./portfolio";
import { assetAllocation, holdingValue, portfolioTotal } from "./finance";

export const MAX_RETURN_HISTORY_MONTHS = 360;
export const MAX_RETURN_CSV_BYTES = 1_000_000;
export const RETURN_MISSING_POLICY =
  "Never fill missing values. Compare on the common complete monthly window; trim only incomplete leading/trailing months and block the run for any internal gap.";
export const ALL_WEATHER_DEFAULT: Allocation = {
  Equity: 30,
  "Mutual Funds": 20,
  Gold: 15,
  Debt: 30,
  Cash: 5,
};

export interface ReturnCsvParseResult {
  observations: MonthlyReturnObservation[];
  errors: string[];
  warnings: string[];
}

export interface BacktestMetric {
  value: number | null;
  unit: "percent" | "ratio" | "months";
  status:
    | "available"
    | "short-window"
    | "insufficient-data"
    | "not-recovered"
    | "no-drawdown";
  method: string;
  startMonth: string | null;
  endMonth: string | null;
  nObs: number;
  annualizationFactor: number | null;
  inputs: Record<string, string | number | boolean | null>;
}

export interface BacktestPeriodReturn {
  label: string;
  months: number;
  totalReturnPct: number | null;
  cagrPct: number | null;
  status: "available" | "insufficient-data";
  startMonth: string | null;
  endMonth: string | null;
}

export interface BacktestStressPeriod {
  id: string;
  label: string;
  startMonth: string;
  endMonth: string;
  totalReturnPct: number | null;
  status: "available" | "unavailable";
  nObs: number;
}

export interface BacktestStrategyResult {
  metrics: {
    totalReturn: BacktestMetric;
    cagr: BacktestMetric;
    annualizedVolatility: BacktestMetric;
    sharpeRatio: BacktestMetric;
    maximumDrawdown: BacktestMetric;
    recoveryPeriod: BacktestMetric;
  };
  periodReturns: BacktestPeriodReturn[];
  stressPeriods: BacktestStressPeriod[];
  cumulativeSeries: Array<{ month: string; valueIndex: number }>;
  monthlyNetReturns: Array<{ month: string; returnPct: number }>;
  rebalancingCostPct: number;
}

export interface BacktestResult {
  status: "ready" | "incomplete-history" | "insufficient-data" | "invalid-config";
  message: string;
  source: {
    sourceName: string;
    sourceType: "user-uploaded";
    verificationStatus: "unverified";
    currency: "INR";
    frequency: "monthly";
    returnBasis: string;
    uploadedAt: string;
    selectedStartMonth: string;
    selectedEndMonth: string;
    commonStartMonth: string | null;
    commonEndMonth: string | null;
    nObs: number;
    leadingMonthsTrimmed: number;
    trailingMonthsTrimmed: number;
    missingMonths: string[];
    missingDataTreatment: string;
  };
  assumptions: {
    baselineWeights: Allocation;
    allWeatherWeights: Allocation;
    rebalanceFrequency: BacktestConfig["rebalanceFrequency"];
    transactionCostBps: number;
    riskFreeAnnualPct: number;
    costMethod: string;
    setupCostIncluded: false;
    survivorshipLimitations: string;
  };
  baseline: BacktestStrategyResult | null;
  allWeather: BacktestStrategyResult | null;
  warnings: string[];
}

export interface CorrelationMatrixResult {
  buckets: AssetBucket[];
  values: Array<Array<number | null>>;
  pairObservationCounts: number[][];
  minimumObservations: number;
  startMonth: string | null;
  endMonth: string | null;
  sourceName: string;
  verificationStatus: "unverified";
}

const aliases: Record<AssetBucket, string[]> = {
  Equity: [
    "equity",
    "equity return",
    "equity returns",
    "stock return",
    "stocks",
    "shares",
    "nifty",
    "nifty 50",
    "direct equity",
  ],
  "Mutual Funds": [
    "mutual funds",
    "mutual fund",
    "mutual funds return",
    "mutual fund return",
    "mf",
    "mf return",
    "funds",
  ],
  Gold: ["gold", "gold return", "gold etf", "gold etf return", "commodity"],
  Debt: [
    "debt",
    "debt return",
    "bonds",
    "bond return",
    "fixed income",
    "fixed income return",
  ],
  Cash: ["cash", "cash return", "cash equivalent", "cash equivalents"],
};

const normalizeHeader = (value: string) =>
  value
    .toLowerCase()
    .replace(/[%₹_]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function splitCsv(input: string): { rows: string[][]; error?: string } {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell.length) return { rows: [], error: "Unexpected quote in CSV." };
      quoted = true;
    } else if (char === ",") {
      row.push(cell.trim());
      cell = "";
    } else if (char === "\n") {
      row.push(cell.trim().replace(/\r$/, ""));
      if (row.some(value => value.length)) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) return { rows: [], error: "Unclosed quoted field in CSV." };
  row.push(cell.trim().replace(/\r$/, ""));
  if (row.some(value => value.length)) rows.push(row);
  return { rows };
}

function parseMonth(value: string): string | null {
  const raw = value.trim();
  const iso = raw.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (iso) {
    const year = Number(iso[1]),
      month = Number(iso[2]),
      day = iso[3] === undefined ? null : Number(iso[3]),
      daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return month >= 1 && month <= 12 && (day === null || (day >= 1 && day <= daysInMonth))
      ? `${iso[1]}-${iso[2]}`
      : null;
  }
  return null;
}

export function parseHistoricalReturnsCSV(csv: string): ReturnCsvParseResult {
  if (new TextEncoder().encode(csv).byteLength > MAX_RETURN_CSV_BYTES)
    return {
      observations: [],
      errors: ["CSV exceeds the 1 MB upload limit."],
      warnings: [],
    };
  const parsed = splitCsv(csv);
  if (parsed.error)
    return { observations: [], errors: [parsed.error], warnings: [] };
  if (parsed.rows.length < 2)
    return {
      observations: [],
      errors: ["Add a header row and at least one monthly observation."],
      warnings: [],
    };
  const headers = parsed.rows[0]!.map(normalizeHeader),
    dateColumn = headers.findIndex(header =>
      ["month", "date", "period", "return month", "month end"].includes(header)
    );
  if (dateColumn < 0)
    return {
      observations: [],
      errors: ["Missing period column; use month, date or period in YYYY-MM format."],
      warnings: [],
    };
  const columns = Object.fromEntries(
    ASSET_BUCKETS.map(bucket => [
      bucket,
      headers.findIndex(header => aliases[bucket].includes(header)),
    ])
  ) as Record<AssetBucket, number>;
  const warnings = ASSET_BUCKETS.filter(bucket => columns[bucket] < 0).map(
    bucket => `No ${bucket} return column was found; those observations remain missing.`
  );
  const errors: string[] = [],
    byMonth = new Map<string, MonthlyReturnObservation>();
  parsed.rows.slice(1).forEach((row, index) => {
    const rowNo = index + 2;
    const month = parseMonth(row[dateColumn] || "");
    if (!month) {
      errors.push(`Row ${rowNo}: period must be a valid YYYY-MM or YYYY-MM-DD date.`);
      return;
    }
    if (byMonth.has(month)) {
      errors.push(`Row ${rowNo}: duplicate month ${month}.`);
      return;
    }
    const returns = Object.fromEntries(
      ASSET_BUCKETS.map(bucket => [bucket, null])
    ) as Record<AssetBucket, number | null>;
    ASSET_BUCKETS.forEach(bucket => {
      const column = columns[bucket];
      if (column < 0 || !row[column]?.trim()) return;
      const raw = row[column]!.trim().replace(/[%₹,\s]/g, ""),
        value = Number(raw);
      if (!Number.isFinite(value) || value <= -100 || value > 500) {
        errors.push(
          `Row ${rowNo}: ${bucket} return must be greater than -100% and no more than 500% (entered in percentage points).`
        );
        return;
      }
      returns[bucket] = value;
    });
    byMonth.set(month, { month, returns });
  });
  const observations = [...byMonth.values()].sort((a, b) =>
    a.month.localeCompare(b.month)
  );
  if (observations.length > MAX_RETURN_HISTORY_MONTHS)
    errors.push(`Keep no more than ${MAX_RETURN_HISTORY_MONTHS} monthly observations.`);
  if (!observations.length && !errors.length)
    errors.push("No valid monthly observations were found.");
  return {
    observations:
      errors.length && errors.some(error => /duplicate month|Row .*period/.test(error))
        ? []
        : observations,
    errors,
    warnings,
  };
}

export function defaultBacktestConfig(
  holdings: Holding[],
  dataset: HistoricalReturnDataset
): BacktestConfig {
  const values = assetAllocation(holdings),
    total = portfolioTotal(holdings),
    baselineWeights = total
      ? (Object.fromEntries(
          ASSET_BUCKETS.map(bucket => [
            bucket,
            (values[bucket] / total) * 100,
          ])
        ) as Allocation)
      : ({
          Equity: 20,
          "Mutual Funds": 20,
          Gold: 20,
          Debt: 20,
          Cash: 20,
        } satisfies Allocation);
  return {
    baselineWeights,
    allWeatherWeights: { ...ALL_WEATHER_DEFAULT },
    rebalanceFrequency: "quarterly",
    transactionCostBps: 10,
    riskFreeAnnualPct: 6,
    startMonth: dataset.startMonth,
    endMonth: dataset.endMonth,
  };
}

const monthIndex = (month: string): number => {
  const parsed = parseMonth(month);
  if (!parsed) return Number.NaN;
  const [year, m] = parsed.split("-").map(Number);
  return year! * 12 + m! - 1;
};
const monthFromIndex = (index: number): string => {
  const year = Math.floor(index / 12),
    month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
};
function monthRange(start: string, end: string): string[] {
  const a = monthIndex(start),
    b = monthIndex(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return [];
  if (b - a + 1 > MAX_RETURN_HISTORY_MONTHS) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => monthFromIndex(a + i));
}
const validWeights = (weights: Allocation) => {
  const values = ASSET_BUCKETS.map(bucket => weights[bucket]);
  return (
    values.every(value => Number.isFinite(value) && value >= 0 && value <= 100) &&
    Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) <= 0.05
  );
};
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
function sampleStd(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const avg = mean(xs);
  return Math.sqrt(xs.reduce((sum, x) => sum + (x - avg) ** 2, 0) / (xs.length - 1));
}
const metric = (
  value: number | null,
  unit: BacktestMetric["unit"],
  status: BacktestMetric["status"],
  method: string,
  startMonth: string | null,
  endMonth: string | null,
  nObs: number,
  annualizationFactor: number | null = null,
  extraInputs: Record<string, string | number | boolean | null> = {}
): BacktestMetric => ({
  value: Number.isFinite(value) ? value : null,
  unit,
  status,
  method,
  startMonth,
  endMonth,
  nObs,
  annualizationFactor,
  inputs: {
    frequency: "monthly",
    startMonth,
    endMonth,
    observations: nObs,
    annualizationFactor,
    ...extraInputs,
  },
});

function annualizedCagr(totalReturn: number, months: string[]): number | null {
  if (!months.length || totalReturn <= -1) return null;
  const first = monthIndex(months[0]!),
    last = monthIndex(months[months.length - 1]!),
    firstDate = new Date(Date.UTC(Math.floor(first / 12), first % 12, 1)),
    lastDate = new Date(Date.UTC(Math.floor(last / 12), (last % 12) + 1, 0)),
    calendarDays = (lastDate.getTime() - firstDate.getTime()) / 86400000 + 1;
  if (calendarDays <= 0) return null;
  return (1 + totalReturn) ** (365 / calendarDays) - 1;
}

function calculateMetricBundle(
  returns: Array<{ month: string; returnPct: number }>,
  riskFreeAnnualPct: number
): BacktestStrategyResult["metrics"] {
  const n = returns.length,
    months = returns.map(row => row.month),
    netReturns = returns.map(row => row.returnPct / 100),
    totalReturn = netReturns.reduce((nav, value) => nav * (1 + value), 1) - 1,
    cagr = annualizedCagr(totalReturn, months),
    volatilityMonthly = sampleStd(netReturns),
    vol = volatilityMonthly === null ? null : volatilityMonthly * Math.sqrt(12),
    rfMonthly = (1 + riskFreeAnnualPct / 100) ** (1 / 12) - 1,
    excess = netReturns.map(value => value - rfMonthly),
    excessStd = sampleStd(excess),
    sharpe =
      excessStd === null || excessStd === 0
        ? null
        : (mean(excess) / excessStd) * Math.sqrt(12);
  let nav = 1,
    peak = 1,
    peakMonth: string | null = months[0] || null,
    troughMonth: string | null = null,
    maxDrawdown = 0,
    peakAtMaxDrawdown = 1;
  const navs = [1];
  for (let i = 0; i < netReturns.length; i++) {
    nav *= 1 + netReturns[i]!;
    navs.push(nav);
    if (nav >= peak) {
      peak = nav;
      peakMonth = months[i]!;
    }
    const drawdown = peak > 0 ? nav / peak - 1 : Number.NaN;
    if (Number.isFinite(drawdown) && drawdown < maxDrawdown) {
      maxDrawdown = drawdown;
      troughMonth = months[i]!;
      peakAtMaxDrawdown = peak;
    }
  }
  let recoveryMonth: string | null = null,
    recoveryMonths: number | null = null;
  if (troughMonth && peakAtMaxDrawdown > 0) {
    const troughIndex = months.indexOf(troughMonth),
      navOffset = troughIndex + 1;
    for (let i = navOffset + 1; i < navs.length; i++) {
      if (navs[i]! >= peakAtMaxDrawdown) {
        recoveryMonth = months[i - 1] || null;
        recoveryMonths = i - 1 - troughIndex;
        break;
      }
    }
  } else if (n) {
    recoveryMonths = 0;
  }
  const start = months[0] || null,
    end = months[months.length - 1] || null,
    windowStatus: BacktestMetric["status"] = n && n < 12 ? "short-window" : "available";
  return {
    totalReturn: metric(
      n ? totalReturn * 100 : null,
      "percent",
      n ? "available" : "insufficient-data",
      "Compound monthly net returns: Π(1 + rₜ) − 1.",
      start,
      end,
      n
    ),
    cagr: metric(
      cagr === null ? null : cagr * 100,
      "percent",
      cagr === null ? "insufficient-data" : windowStatus,
      "(V_end/V_start)^(365/calendar_days) − 1; calendar span runs from the first month start through the last month end.",
      start,
      end,
      n,
      12
    ),
    annualizedVolatility: metric(
      vol === null ? null : vol * 100,
      "percent",
      vol === null ? "insufficient-data" : windowStatus,
      "Sample standard deviation of monthly net returns × √12.",
      start,
      end,
      n,
      12
    ),
    sharpeRatio: metric(
      sharpe,
      "ratio",
      sharpe === null ? "insufficient-data" : windowStatus,
      "Mean monthly excess net return ÷ sample standard deviation of monthly excess returns × √12; annual risk-free assumption is compounded to a monthly rate.",
      start,
      end,
      n,
      12,
      { riskFreeAnnualPct }
    ),
    maximumDrawdown: metric(
      n ? maxDrawdown * 100 : null,
      "percent",
      n ? "available" : "insufficient-data",
      "Minimum wealth index / running peak − 1; negative values represent drawdowns.",
      start,
      end,
      n
    ),
    recoveryPeriod: metric(
      recoveryMonths,
      "months",
      !n
        ? "insufficient-data"
        : !troughMonth
          ? "no-drawdown"
          : recoveryMonth
            ? "available"
            : "not-recovered",
      "Calendar months from the maximum-drawdown trough to first recovery of that prior peak; not recovered means not recovered within this sample.",
      start,
      end,
      n
    ),
  };
}

function strategyRun(
  rows: MonthlyReturnObservation[],
  weightsPct: Allocation,
  config: BacktestConfig
): BacktestStrategyResult {
  let weights = Object.fromEntries(
      ASSET_BUCKETS.map(bucket => [bucket, weightsPct[bucket] / 100])
    ) as Record<AssetBucket, number>,
    nav = 100,
    totalCostPct = 0;
  const monthlyNetReturns: Array<{ month: string; returnPct: number }> = [],
    cumulativeSeries: Array<{ month: string; valueIndex: number }> = [];
  const cadence: Record<BacktestConfig["rebalanceFrequency"], number> = {
    monthly: 1,
    quarterly: 3,
    annual: 12,
    none: Number.POSITIVE_INFINITY,
  };
  rows.forEach((row, index) => {
    let costFraction = 0;
    if (index > 0 && index % cadence[config.rebalanceFrequency] === 0) {
      const target = Object.fromEntries(
          ASSET_BUCKETS.map(bucket => [bucket, weightsPct[bucket] / 100])
        ) as Record<AssetBucket, number>,
        turnover =
          ASSET_BUCKETS.reduce(
            (sum, bucket) => sum + Math.abs(target[bucket] - weights[bucket]),
            0
          ) / 2;
      costFraction = turnover * (config.transactionCostBps / 10_000);
      totalCostPct += costFraction * 100;
      weights = target;
    }
    const grossReturn = ASSET_BUCKETS.reduce(
      (sum, bucket) => sum + weights[bucket] * (row.returns[bucket]! / 100),
      0
    );
    const netReturn = (1 - costFraction) * (1 + grossReturn) - 1;
    nav *= 1 + netReturn;
    monthlyNetReturns.push({ month: row.month, returnPct: netReturn * 100 });
    cumulativeSeries.push({ month: row.month, valueIndex: nav });
    const denominator = 1 + grossReturn;
    if (denominator > 0) {
      weights = Object.fromEntries(
        ASSET_BUCKETS.map(bucket => [
          bucket,
          (weights[bucket] * (1 + row.returns[bucket]! / 100)) / denominator,
        ])
      ) as Record<AssetBucket, number>;
    }
  });
  const metrics = calculateMetricBundle(monthlyNetReturns, config.riskFreeAnnualPct),
    periodLengths = [
      { label: "1 year", months: 12 },
      { label: "3 years", months: 36 },
      { label: "5 years", months: 60 },
      { label: "10 years", months: 120 },
    ];
  const periodReturns = periodLengths.map(({ label, months }) => {
    const subset = monthlyNetReturns.slice(-months),
      valid = subset.length === months,
      totalReturn = valid
        ? subset.reduce((nav, x) => nav * (1 + x.returnPct / 100), 1) - 1
        : null;
    return {
      label,
      months,
      totalReturnPct: totalReturn === null ? null : totalReturn * 100,
      cagrPct:
        totalReturn === null
          ? null
          : (annualizedCagr(totalReturn, subset.map(x => x.month)) ?? 0) * 100,
      status: valid ? ("available" as const) : ("insufficient-data" as const),
      startMonth: valid ? subset[0]!.month : null,
      endMonth: valid ? subset[subset.length - 1]!.month : null,
    };
  });
  const stressDefinitions = [
    { id: "gfc", label: "Global financial crisis proxy", startMonth: "2008-01", endMonth: "2009-03" },
    { id: "taper", label: "2013 taper-tantrum proxy", startMonth: "2013-05", endMonth: "2013-09" },
    { id: "covid", label: "COVID shock proxy", startMonth: "2020-02", endMonth: "2020-04" },
    { id: "inflation", label: "2022 inflation/rate repricing proxy", startMonth: "2022-01", endMonth: "2022-10" },
  ];
  const stressPeriods = stressDefinitions.map(event => {
    const expected = monthRange(event.startMonth, event.endMonth),
      subset = monthlyNetReturns.filter(
        item => item.month >= event.startMonth && item.month <= event.endMonth
      ),
      valid =
        expected.length > 0 &&
        expected.length === subset.length &&
        expected.every((month, i) => subset[i]?.month === month);
    return {
      ...event,
      totalReturnPct: valid
        ? (subset.reduce((value, x) => value * (1 + x.returnPct / 100), 1) - 1) * 100
        : null,
      status: valid ? ("available" as const) : ("unavailable" as const),
      nObs: valid ? subset.length : 0,
    };
  });
  return {
    metrics,
    periodReturns,
    stressPeriods,
    cumulativeSeries,
    monthlyNetReturns,
    rebalancingCostPct: totalCostPct,
  };
}

export function runHistoricalComparison(
  dataset: HistoricalReturnDataset | null | undefined,
  config: BacktestConfig | null | undefined
): BacktestResult | null {
  if (!dataset || !config) return null;
  const startIndex = monthIndex(config.startMonth),
    endIndex = monthIndex(config.endMonth),
    selectedMonths = monthRange(config.startMonth, config.endMonth),
    required = ASSET_BUCKETS.filter(
      bucket =>
        config.baselineWeights[bucket] > 0 || config.allWeatherWeights[bucket] > 0
    );
  const sourceBase: BacktestResult["source"] = {
    sourceName: dataset.sourceName,
    sourceType: "user-uploaded",
    verificationStatus: "unverified",
    currency: "INR",
    frequency: "monthly",
    returnBasis: dataset.returnBasis,
    uploadedAt: dataset.uploadedAt,
    selectedStartMonth: config.startMonth,
    selectedEndMonth: config.endMonth,
    commonStartMonth: null,
    commonEndMonth: null,
    nObs: 0,
    leadingMonthsTrimmed: 0,
    trailingMonthsTrimmed: 0,
    missingMonths: [],
    missingDataTreatment: dataset.missingDataTreatment,
  };
  const assumptions: BacktestResult["assumptions"] = {
    baselineWeights: config.baselineWeights,
    allWeatherWeights: config.allWeatherWeights,
    rebalanceFrequency: config.rebalanceFrequency,
    transactionCostBps: config.transactionCostBps,
    riskFreeAnnualPct: config.riskFreeAnnualPct,
    costMethod:
      "One-way turnover = 0.5 × Σ|target − pre-rebalance weight|; flat basis points are charged on traded notional at periodic rebalances.",
    setupCostIncluded: false,
    survivorshipLimitations:
      "User-uploaded asset-bucket returns do not establish point-in-time constituents, delisted assets, corporate actions, market impact or survivorship-free coverage.",
  };
  const invalidConfig =
    !Number.isFinite(startIndex) ||
    !Number.isFinite(endIndex) ||
    selectedMonths.length === 0 ||
    selectedMonths.length > MAX_RETURN_HISTORY_MONTHS ||
    !validWeights(config.baselineWeights) ||
    !validWeights(config.allWeatherWeights) ||
    !Number.isFinite(config.transactionCostBps) ||
    config.transactionCostBps < 0 ||
    config.transactionCostBps > 1000 ||
    !Number.isFinite(config.riskFreeAnnualPct) ||
    config.riskFreeAnnualPct <= -100 ||
    config.riskFreeAnnualPct > 100 ||
    dataset.observations.length > MAX_RETURN_HISTORY_MONTHS ||
    dataset.sourceType !== "user-uploaded" ||
    dataset.verificationStatus !== "unverified";
  const commonResult = (
    status: BacktestResult["status"],
    message: string,
    missingMonths: string[] = []
  ): BacktestResult => ({
    status,
    message,
    source: { ...sourceBase, missingMonths },
    assumptions,
    baseline: null,
    allWeather: null,
    warnings: [
      "User-uploaded data is not independently verified and is not represented as a verified market-data feed.",
      ...(dataset.returnBasis !== "total-return"
        ? ["Uploaded return basis is not confirmed as total return; dividends may be excluded or unknown."]
        : []),
      "Monthly bucket proxies do not resolve security-level survivorship, delisting, constituent changes or corporate-action treatment.",
      "Flat rebalance costs are modeling assumptions, not brokerage, tax, slippage or market-impact estimates.",
    ],
  });
  if (invalidConfig)
    return commonResult(
      "invalid-config",
      "Backtest settings or dataset exceed supported limits."
    );
  const lookup = new Map(dataset.observations.map(row => [row.month, row]));
  if (lookup.size !== dataset.observations.length)
    return commonResult("invalid-config", "Dataset contains duplicate months.");
  const complete = selectedMonths.map(month => {
    const row = lookup.get(month);
    return row && required.every(bucket => {
      const value = row.returns[bucket];
      return Number.isFinite(value) && value !== null && value > -100 && value <= 500;
    })
      ? row
      : null;
  });
  const first = complete.findIndex(Boolean),
    last = complete.findLastIndex(Boolean);
  if (first < 0)
    return commonResult(
      "insufficient-data",
      "No complete monthly observations are available for every bucket used by both strategies."
    );
  const gaps = complete
    .slice(first, last + 1)
    .map((row, index) => (row ? null : selectedMonths[first + index]!))
    .filter((month): month is string => month !== null),
    commonRows = complete.slice(first, last + 1).filter(
      (row): row is MonthlyReturnObservation => row !== null
    );
  const source = {
    ...sourceBase,
    commonStartMonth: commonRows[0]!.month,
    commonEndMonth: commonRows[commonRows.length - 1]!.month,
    nObs: commonRows.length,
    leadingMonthsTrimmed: first,
    trailingMonthsTrimmed: selectedMonths.length - last - 1,
    missingMonths: gaps,
  };
  if (gaps.length)
    return {
      ...commonResult(
        "incomplete-history",
        "The selected period has internal missing months. Resolve them or choose a continuous complete window; no strategy metrics were computed.",
        gaps
      ),
      source,
    };
  const safeRows = commonRows.map(row => ({
    ...row,
    returns: { ...row.returns },
  }));
  return {
    status: "ready",
    message: "Both strategies use the same continuous complete monthly return window and assumptions.",
    source,
    assumptions,
    baseline: strategyRun(safeRows, config.baselineWeights, config),
    allWeather: strategyRun(safeRows, config.allWeatherWeights, config),
    warnings: [
      "User-uploaded data is not independently verified and is not represented as a verified market-data feed.",
      ...(dataset.returnBasis !== "total-return"
        ? ["Uploaded return basis is not confirmed as total return; dividends may be excluded or unknown."]
        : []),
      "Monthly bucket proxies do not resolve security-level survivorship, delisting, constituent changes or corporate-action treatment.",
      "Flat rebalance costs are modeling assumptions, not brokerage, tax, slippage or market-impact estimates.",
    ],
  };
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 2 || xs.length !== ys.length) return null;
  const avgX = mean(xs),
    avgY = mean(ys),
    sdX = sampleStd(xs),
    sdY = sampleStd(ys);
  if (sdX === null || sdY === null || sdX === 0 || sdY === 0) return null;
  const covariance =
    xs.reduce((sum, x, i) => sum + (x - avgX) * (ys[i]! - avgY), 0) /
    (xs.length - 1);
  return Math.max(-1, Math.min(1, covariance / (sdX * sdY)));
}

export function calculateReturnCorrelations(
  dataset: HistoricalReturnDataset | null | undefined,
  minimumObservations = 12
): CorrelationMatrixResult | null {
  if (!dataset) return null;
  const values: Array<Array<number | null>> = ASSET_BUCKETS.map(() =>
      ASSET_BUCKETS.map(() => null)
    ),
    pairObservationCounts = ASSET_BUCKETS.map(() => ASSET_BUCKETS.map(() => 0));
  for (let i = 0; i < ASSET_BUCKETS.length; i++) {
    for (let j = i; j < ASSET_BUCKETS.length; j++) {
      const left = ASSET_BUCKETS[i]!,
        right = ASSET_BUCKETS[j]!,
        pairs = dataset.observations
          .filter(
            row =>
              row.returns[left] !== null &&
              row.returns[right] !== null &&
              Number.isFinite(row.returns[left]) &&
              Number.isFinite(row.returns[right])
          )
          .sort((a, b) => a.month.localeCompare(b.month)),
        correlation =
          pairs.length >= minimumObservations
            ? pearson(
                pairs.map(row => row.returns[left]! / 100),
                pairs.map(row => row.returns[right]! / 100)
              )
            : null;
      values[i]![j] = correlation;
      values[j]![i] = correlation;
      pairObservationCounts[i]![j] = pairs.length;
      pairObservationCounts[j]![i] = pairs.length;
    }
  }
  const allMonths = dataset.observations.map(row => row.month).sort();
  return {
    buckets: [...ASSET_BUCKETS],
    values,
    pairObservationCounts,
    minimumObservations,
    startMonth: allMonths[0] || null,
    endMonth: allMonths[allMonths.length - 1] || null,
    sourceName: dataset.sourceName,
    verificationStatus: "unverified",
  };
}

export function holdingsBaselineWeights(holdings: Holding[]): Allocation {
  const allocation = assetAllocation(holdings),
    total = portfolioTotal(holdings);
  return total
    ? (Object.fromEntries(
        ASSET_BUCKETS.map(bucket => [bucket, (allocation[bucket] / total) * 100])
      ) as Allocation)
    : ({
        Equity: 20,
        "Mutual Funds": 20,
        Gold: 20,
        Debt: 20,
        Cash: 20,
      } satisfies Allocation);
}

export function hhiFromWeights(weights: number[]): number | null {
  const clean = weights.filter(value => Number.isFinite(value) && value > 0),
    total = clean.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return null;
  return clean.reduce((sum, value) => sum + (value / total) ** 2, 0);
}

/** Utility to ensure imported values remain finite when a UI formats them. */
export function safeMetricValue(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}
