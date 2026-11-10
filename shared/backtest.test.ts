import { describe, expect, it } from "vitest";
import {
  calculateReturnCorrelations,
  MAX_RETURN_CSV_BYTES,
  parseHistoricalReturnsCSV,
  runHistoricalComparison,
} from "./backtest";
import { ASSET_BUCKETS } from "./portfolio";
import type {
  Allocation,
  BacktestConfig,
  HistoricalReturnDataset,
  MonthlyReturnObservation,
} from "./portfolio";

const allEquity: Allocation = {
  Equity: 100,
  "Mutual Funds": 0,
  Gold: 0,
  Debt: 0,
  Cash: 0,
};
const equityGoldHalf: Allocation = {
  Equity: 50,
  "Mutual Funds": 0,
  Gold: 50,
  Debt: 0,
  Cash: 0,
};
const row = (
  month: string,
  values: Partial<Record<(typeof ASSET_BUCKETS)[number], number | null>> = {}
): MonthlyReturnObservation => ({
  month,
  returns: {
    Equity: null,
    "Mutual Funds": null,
    Gold: null,
    Debt: null,
    Cash: null,
    ...values,
  },
});
const dataset = (observations: MonthlyReturnObservation[]): HistoricalReturnDataset => ({
  sourceType: "user-uploaded",
  verificationStatus: "unverified",
  sourceName: "Test data, not verified",
  sourceUrl: null,
  uploadedAt: "2026-10-10T00:00:00.000Z",
  currency: "INR",
  frequency: "monthly",
  returnBasis: "total-return",
  startMonth: observations[0]?.month ?? "2024-01",
  endMonth: observations.at(-1)?.month ?? "2024-01",
  missingDataTreatment:
    "Never fill missing values; use only the common complete monthly period.",
  observations,
});
const weights = (patch: Partial<Allocation> = {}): Allocation => ({
  ...allEquity,
  ...patch,
});
const config = (
  startMonth: string,
  endMonth: string,
  patch: Partial<BacktestConfig> = {}
): BacktestConfig => ({
  baselineWeights: { ...allEquity },
  allWeatherWeights: { ...allEquity },
  rebalanceFrequency: "none",
  transactionCostBps: 0,
  riskFreeAnnualPct: 6,
  startMonth,
  endMonth,
  ...patch,
});
const months = (startYear: number, count: number) =>
  Array.from({ length: count }, (_, index) => {
    const serial = startYear * 12 + index;
    return `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
  });

describe("user-uploaded historical comparison", () => {
  it("parses flexible monthly bucket aliases and preserves missing observations", () => {
    const parsed = parseHistoricalReturnsCSV(
      [
        "month,Equity (%),MF return,Gold ETF %,fixed income return,Cash",
        "2024-01,1.2,0.8,,0.25,0",
        "2024-02,-2,1.0,0.2,0.3,0.1",
      ].join("\n")
    );
    expect(parsed.errors).toEqual([]);
    expect(parsed.warnings).toEqual([]);
    expect(parsed.observations).toHaveLength(2);
    expect(parsed.observations[0]).toEqual({
      month: "2024-01",
      returns: {
        Equity: 1.2,
        "Mutual Funds": 0.8,
        Gold: null,
        Debt: 0.25,
        Cash: 0,
      },
    });
  });

  it("rejects malformed dates, duplicate months, invalid return bounds and oversized files", () => {
    expect(
      parseHistoricalReturnsCSV("date,equity\n2024-02-30,1").errors.join(" ")
    ).toMatch(/valid YYYY-MM/);
    expect(
      parseHistoricalReturnsCSV("month,equity\n2024-01,1\n2024-01,2")
        .errors.join(" ")
    ).toMatch(/duplicate month/);
    expect(
      parseHistoricalReturnsCSV("month,equity\n2024-01,-100").errors.join(" ")
    ).toMatch(/greater than -100%/);
    expect(
      parseHistoricalReturnsCSV("month,equity\n2024-01,500.1").errors.join(" ")
    ).toMatch(/no more than 500%/);
    expect(parseHistoricalReturnsCSV("x".repeat(MAX_RETURN_CSV_BYTES + 1)).errors[0])
      .toMatch(/1 MB/);
  });

  it("uses one common period and documents provenance and the annual risk-free input", () => {
    const observations = months(2023, 12).map(month => row(month, { Equity: 1 }));
    const result = runHistoricalComparison(
      dataset(observations),
      config("2023-01", "2023-12")
    );
    expect(result?.status).toBe("ready");
    expect(result?.source).toMatchObject({
      sourceType: "user-uploaded",
      verificationStatus: "unverified",
      commonStartMonth: "2023-01",
      commonEndMonth: "2023-12",
      nObs: 12,
    });
    expect(result?.baseline?.metrics.totalReturn.value).toBeCloseTo(
      (1.01 ** 12 - 1) * 100,
      8
    );
    expect(result?.baseline?.metrics.cagr.value).toBeCloseTo(
      (1.01 ** 12 - 1) * 100,
      8
    );
    expect(result?.baseline?.metrics.annualizedVolatility.value).toBe(0);
    expect(result?.baseline?.metrics.sharpeRatio.value).toBeNull();
    expect(result?.baseline?.metrics.sharpeRatio.inputs.riskFreeAnnualPct).toBe(6);
    expect(result?.baseline?.metrics.sharpeRatio.status).toBe("insufficient-data");
    expect(result?.baseline?.metrics.maximumDrawdown.value).toBe(0);
    expect(result?.baseline?.metrics.recoveryPeriod.status).toBe("no-drawdown");
    expect(result?.baseline?.periodReturns[0]?.status).toBe("available");
    expect(result?.baseline?.stressPeriods.every(event => event.status === "unavailable"))
      .toBe(true);
    expect(result?.assumptions.setupCostIncluded).toBe(false);
  });

  it("trims only incomplete edges and blocks internal gaps without metrics", () => {
    const observations = [
      row("2024-02", { Equity: 1 }),
      row("2024-04", { Equity: 1 }),
    ];
    const result = runHistoricalComparison(
      dataset(observations),
      config("2024-01", "2024-05")
    );
    expect(result?.status).toBe("incomplete-history");
    expect(result?.source).toMatchObject({
      commonStartMonth: "2024-02",
      commonEndMonth: "2024-04",
      leadingMonthsTrimmed: 1,
      trailingMonthsTrimmed: 1,
      missingMonths: ["2024-03"],
      nObs: 2,
    });
    expect(result?.baseline).toBeNull();
    expect(result?.allWeather).toBeNull();
  });

  it("ignores missing buckets only when both strategies assign them zero weight", () => {
    const observations = [row("2024-01", { Equity: 1, Gold: null })];
    const result = runHistoricalComparison(
      dataset(observations),
      config("2024-01", "2024-01", {
        baselineWeights: weights(),
        allWeatherWeights: weights(),
      })
    );
    expect(result?.status).toBe("ready");
    expect(result?.source.nObs).toBe(1);
    expect(result?.baseline?.metrics.cagr.status).toBe("short-window");
  });

  it("computes drawdown and first recovery period from the compounded series", () => {
    const observations = [
      row("2024-01", { Equity: 20 }),
      row("2024-02", { Equity: -25 }),
      row("2024-03", { Equity: 100 / 3 }),
    ];
    const result = runHistoricalComparison(
      dataset(observations),
      config("2024-01", "2024-03")
    );
    expect(result?.status).toBe("ready");
    expect(result?.baseline?.metrics.maximumDrawdown.value).toBeCloseTo(-25, 8);
    expect(result?.baseline?.metrics.recoveryPeriod.value).toBe(1);
    expect(result?.baseline?.metrics.recoveryPeriod.status).toBe("available");
  });

  it("applies the same one-way-turnover fee rule to both allocations", () => {
    const observations = [
      row("2024-01", { Equity: 50, Gold: 0 }),
      row("2024-02", { Equity: 0, Gold: 0 }),
    ];
    const sameTargets = equityGoldHalf;
    const paid = runHistoricalComparison(
      dataset(observations),
      config("2024-01", "2024-02", {
        baselineWeights: sameTargets,
        allWeatherWeights: sameTargets,
        rebalanceFrequency: "monthly",
        transactionCostBps: 100,
      })
    );
    const free = runHistoricalComparison(
      dataset(observations),
      config("2024-01", "2024-02", {
        baselineWeights: sameTargets,
        allWeatherWeights: sameTargets,
        rebalanceFrequency: "none",
        transactionCostBps: 100,
      })
    );
    expect(paid?.baseline?.monthlyNetReturns[1]?.returnPct).toBeCloseTo(-0.1, 8);
    expect(paid?.baseline?.rebalancingCostPct).toBeCloseTo(0.1, 8);
    expect(paid?.baseline?.monthlyNetReturns).toEqual(
      paid?.allWeather?.monthlyNetReturns
    );
    expect(free?.baseline?.rebalancingCostPct).toBe(0);
    expect(free?.baseline?.metrics.totalReturn.value).toBeCloseTo(25, 8);
  });

  it("keeps extreme allowed returns finite and labels short windows", () => {
    const observations = [
      row("2024-01", { Equity: 500 }),
      row("2024-02", { Equity: -99.9 }),
    ];
    const result = runHistoricalComparison(
      dataset(observations),
      config("2024-01", "2024-02")
    );
    expect(result?.status).toBe("ready");
    expect(result?.baseline?.metrics.cagr.status).toBe("short-window");
    expect(Number.isFinite(result?.baseline?.metrics.annualizedVolatility.value)).toBe(true);
    expect(Number.isFinite(result?.baseline?.metrics.maximumDrawdown.value)).toBe(true);
    expect(result?.baseline?.cumulativeSeries.every(point => Number.isFinite(point.valueIndex)))
      .toBe(true);
  });

  it("requires valid target-weight totals and returns no result without input", () => {
    expect(runHistoricalComparison(null, null)).toBeNull();
    const observation = dataset([row("2024-01", { Equity: 1 })]);
    const invalid = runHistoricalComparison(
      observation,
      config("2024-01", "2024-01", {
        baselineWeights: weights({ Gold: 1 }),
      })
    );
    expect(invalid?.status).toBe("invalid-config");
    expect(invalid?.baseline).toBeNull();
  });

  it("computes correlations only from enough paired observations and flags constants", () => {
    const observations = months(2023, 12).map((month, index) =>
      row(month, {
        Equity: index + 1,
        "Mutual Funds": 12 - index,
        Gold: 0,
      })
    );
    const result = calculateReturnCorrelations(dataset(observations));
    expect(result?.pairObservationCounts[0]?.[1]).toBe(12);
    expect(result?.values[0]?.[1]).toBeCloseTo(-1, 8);
    expect(result?.values[0]?.[2]).toBeNull();
    expect(result?.pairObservationCounts[0]?.[2]).toBe(12);

    const short = calculateReturnCorrelations(dataset(observations.slice(0, 11)));
    expect(short?.pairObservationCounts[0]?.[1]).toBe(11);
    expect(short?.values[0]?.[1]).toBeNull();
  });
});
