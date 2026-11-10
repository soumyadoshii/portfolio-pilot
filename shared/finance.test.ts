import { describe, expect, it } from "vitest";
import {
  allocationReview,
  assetAllocation,
  assetBucketFor,
  calculateStress,
  deterministicCoachAnswer,
  generatePortfolioReport,
  goalProjection,
  parseHoldingsCSV,
  portfolioTotal,
  riskProfileFromAnswers,
  scenarioCatalog,
  scoreDiversification,
} from "./finance";
import { DEMO_PERSONAS } from "../frontend/src/data/demo";
import { runHistoricalComparison } from "./backtest";
import { ASSET_BUCKETS, type BacktestConfig, type Goal, type HistoricalReturnDataset, type Holding, type StressScenario } from "./portfolio";
const sample = DEMO_PERSONAS[0].state;
const h = (
  id: string,
  bucket: Holding["assetType"],
  value: number,
  sector = "Tech"
): Holding => ({
  id,
  symbol: id,
  name: id,
  assetType: bucket,
  sector,
  geography: "India",
  marketCap: "Large",
  quantity: 1,
  averagePrice: value,
  currentPrice: value,
  currentValue: value,
});
const goal: Goal = {
  id: "g",
  name: "Retirement",
  category: "Retirement",
  targetAmount: 1_000_000,
  currentAmount: 100_000,
  targetDate: "2036-01-01",
  monthlyContribution: 5_000,
  expectedReturnPct: 8,
  inflationPct: 5,
  createdAt: "2025-01-01",
};
describe("portfolio finance engine", () => {
  it("maps asset buckets and totals holdings consistently", () => {
    const xs = [
      h("a", "Equity", 100),
      h("b", "ETF", 50),
      h("c", "Gold", 25),
      h("d", "Debt", 15),
      h("e", "Cash", 10),
    ];
    expect(assetBucketFor(xs[1])).toBe("Mutual Funds");
    expect(portfolioTotal(xs)).toBe(200);
    expect(assetAllocation(xs)).toEqual({
      Equity: 100,
      "Mutual Funds": 50,
      Gold: 25,
      Debt: 15,
      Cash: 10,
    });
  });
  it("projects inflation-adjusted targets and separates status from original progress", () => {
    const p = goalProjection(goal, new Date("2026-01-01T00:00:00"));
    expect(p.months).toBeGreaterThan(110);
    expect(p.targetInflationAdjusted).toBeGreaterThan(goal.targetAmount);
    expect(p.progressPct).toBe(10);
    expect(["On Track", "Needs Attention", "Behind"]).toContain(p.status);
    expect(p.requiredMonthlyContribution).toBeGreaterThan(0);
  });
  it("scores diversification on a 0–100 scale and yields zero for empty state", () => {
    expect(scoreDiversification([]).total).toBe(0);
    const result = scoreDiversification(sample.holdings);
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
    expect(result.weights).toEqual({
      assetClass: 30,
      sector: 20,
      securityConcentration: 20,
      correlation: 20,
      geography: 10,
    });
  });
  it("applies bucket percentage-point shocks to value and preserves custom names", () => {
    const xs = [h("eq", "Equity", 1000), h("gold", "Gold", 500)];
    const sc: StressScenario = {
      id: "my",
      name: "Exact custom storm",
      description: "test",
      returnsPct: {
        Equity: -20,
        "Mutual Funds": -10,
        Gold: 10,
        Debt: 0,
        Cash: 0,
      },
      recoveryMonths: 12,
      isCustom: true,
    };
    const r = calculateStress(xs, sc, [goal]);
    expect(r.afterValue).toBe(1350);
    expect(r.changeValue).toBe(-150);
    expect(r.scenarioName).toBe("Exact custom storm");
    expect(r.goalImpacts).toHaveLength(1);
    expect(r.holdingImpacts.find(x => x.symbol === "eq")?.changeValue).toBe(
      -200
    );
  });
  it("compares target drift against percentage-point tolerances", () => {
    const xs = [h("a", "Equity", 800), h("b", "Debt", 200)];
    const targets = {
      Equity: 70,
      "Mutual Funds": 0,
      Gold: 0,
      Debt: 30,
      Cash: 0,
    };
    const tolerances = {
      Equity: 5,
      "Mutual Funds": 0,
      Gold: 0,
      Debt: 5,
      Cash: 0,
    };
    const rows = allocationReview(xs, targets, tolerances);
    expect(rows.find(x => x.bucket === "Equity")?.outsideTolerance).toBe(true);
    expect(rows.find(x => x.bucket === "Debt")?.adjustmentValue).toBe(100);
  });
  it("parses flexible headers, quoted commas and reports bad rows without losing valid rows", () => {
    const csv =
      'Ticker,Name,Market Value,Asset Type,Quantity\nINFY,"Infosys, Ltd","12,500",Equity,10\nBAD,No value,,Equity,1\n';
    const out = parseHoldingsCSV(csv);
    expect(out.holdings).toHaveLength(1);
    expect(out.holdings[0].name).toBe("Infosys, Ltd");
    expect(out.holdings[0].currentValue).toBe(12500);
    expect(out.errors[0]).toMatch(/Row 3/);
  });
  it("supports additional required aliases, malformed quoting and header errors", () => {
    expect(
      parseHoldingsCSV(`instrument,amount\nABC,"₹1,200"`).holdings[0].symbol
    ).toBe("ABC");
    expect(parseHoldingsCSV(`symbol,value\nABC,"10`).errors.join(" ")).toMatch(
      /unclosed quoted/
    );
    expect(parseHoldingsCSV("name,price\nX,3").errors.join(" ")).toMatch(
      /symbol column/
    );
  });
  it("keeps holding IDs stable when the same CSV is parsed again", () => {
    const csv = "symbol,current value,quantity\nINFY,1200,10\n";

    const first = parseHoldingsCSV(csv);
    const second = parseHoldingsCSV(csv);

    expect(first.holdings).toHaveLength(1);
    expect(second.holdings).toHaveLength(1);
    expect(second.holdings[0].id).toBe(first.holdings[0].id);
  });

  it("skips identical duplicate holdings within one CSV", () => {
    const csv =
      "symbol,current value,quantity\nINFY,1200,10\nINFY,1200,10\n";

    const result = parseHoldingsCSV(csv);

    expect(result.holdings).toHaveLength(1);
    expect(result.errors.join(" ")).toMatch(/duplicate/i);
  });
  it("preserves holdings with the same symbol but different values", () => {
  const csv =
    "symbol,current value,quantity\n" +
    "INFY,1200,10\n" +
    "INFY,1500,10\n";

  const result = parseHoldingsCSV(csv);

  expect(result.holdings).toHaveLength(2);
  expect(result.holdings.map((holding) => holding.currentValue)).toEqual([
    1200,
    1500,
  ]);
});

  it("reports rows with inconsistent column counts", () => {
    const csv =
      "symbol,current value,quantity\nINFY,1200,10\nTCS,2000\n";

    const result = parseHoldingsCSV(csv);

    expect(result.holdings).toHaveLength(1);
    expect(result.errors.join(" ")).toMatch(/row 3/i);
  });

  it("rejects invalid numeric values instead of silently replacing them", () => {
    const csv =
      "symbol,current value,quantity,average price\n" +
      "INFY,1200,not-a-number,100\n" +
      "TCS,2000,10,invalid\n";

    const result = parseHoldingsCSV(csv);

    expect(result.holdings).toHaveLength(0);
    expect(result.errors.join(" ")).toMatch(/row 2/i);
    expect(result.errors.join(" ")).toMatch(/row 3/i);
  });

  it("rejects duplicate column headers", () => {
    const csv = "symbol,symbol,current value\nINFY,INFY,1200\n";

    const result = parseHoldingsCSV(csv);

    expect(result.errors.join(" ")).toMatch(/duplicate.*header/i);
  });

  it("supports a UTF-8 BOM at the beginning of the CSV", () => {
    const csv = "\uFEFFsymbol,current value\nINFY,1200\n";

    const result = parseHoldingsCSV(csv);

    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0].symbol).toBe("INFY");
  });

  it("offers stable risk labels and a grounded deterministic explanation", () => {
    expect(riskProfileFromAnswers(Array(8).fill(0)).profile).toBe(
      "Conservative"
    );
    expect(riskProfileFromAnswers(Array(8).fill(4)).profile).toBe("Aggressive");
    expect(scenarioCatalog().length).toBeGreaterThanOrEqual(6);
    expect(deterministicCoachAnswer("How much gold?", sample)).toMatch(
      /Gold is/
    );
    expect(
      deterministicCoachAnswer("Portfolio?", { ...sample, holdings: [] })
    ).toMatch(/no holdings/i);
  });

  it("grounds monthly-investment and portfolio-change prompts in saved facts", () => {
    const withHistory = {
      ...sample,
      profile: { ...sample.profile, monthlyInvestment: 25_000 },
      snapshots: [
        {
          id: "old",
          date: "2025-01-01",
          label: "Earlier",
          totalValue: 100_000,
          source: "manual" as const,
        },
        {
          id: "new",
          date: "2026-01-01",
          label: "Latest",
          totalValue: 125_000,
          source: "manual" as const,
        },
      ],
    };
    expect(
      deterministicCoachAnswer("What if I invest more each month?", withHistory)
    ).toMatch(/₹25,000 per month/i);
    expect(
      deterministicCoachAnswer("What if I invest more each month?", withHistory)
    ).toMatch(/no additional amount/i);
    expect(
      deterministicCoachAnswer("What changed in my portfolio?", withHistory)
    ).toMatch(/₹25,000/);
  });

  it("includes entered returns, risk, monthly contributions and rebalance review in reports", () => {
    const report = generatePortfolioReport(sample);
    const content = report.sections
      .map(section => `${section.heading}: ${section.body}`)
      .join(" ");
    expect(content).toMatch(/unrealized gain\/loss/i);
    expect(content).toMatch(/Portfolio Risk Profile/);
    expect(content).toMatch(/monthly investment/i);
    expect(content).toMatch(/required ₹/i);
    expect(content).toMatch(/rebalance review/i);
  });

  it("uses end-of-month ordinary-annuity contributions at zero return", () => {
    const zeroReturn: Goal = {
      ...goal,
      targetAmount: 120,
      currentAmount: 100,
      monthlyContribution: 10,
      expectedReturnPct: 0,
      inflationPct: 0,
      targetDate: "2026-01-01",
    };
    const projection = goalProjection(zeroReturn, new Date("2025-01-01T00:00:00"));
    expect(projection.months).toBe(12);
    expect(projection.projectedCorpus).toBeCloseTo(220, 8);
    expect(projection.requiredMonthlyContribution).toBeCloseTo(20 / 12, 8);
    expect(projection.targetInflationAdjusted).toBe(120);
  });

  it("keeps negative-return assumptions finite and leaves a matured shortfall unavailable", () => {
    const negative: Goal = {
      ...goal,
      targetAmount: 1_200,
      currentAmount: 100,
      monthlyContribution: 0,
      expectedReturnPct: -12,
      inflationPct: 0,
      targetDate: "2026-01-01",
    };
    const declining = goalProjection(negative, new Date("2025-01-01T00:00:00"));
    expect(declining.projectedCorpus).toBeGreaterThan(0);
    expect(declining.projectedCorpus).toBeLessThan(100);
    expect(declining.requiredMonthlyContribution).toBeGreaterThan((1_200 - 100) / 12);

    const fullyLost = goalProjection(
      { ...negative, expectedReturnPct: -100 },
      new Date("2025-01-01T00:00:00")
    );
    expect(fullyLost.projectedCorpus).toBe(0);
    expect(fullyLost.requiredMonthlyContribution).toBe(1_200);

    const matured = goalProjection(
      { ...negative, targetDate: "2025-01-01" },
      new Date("2025-01-01T00:00:00")
    );
    expect(matured.months).toBe(0);
    expect(matured.requiredMonthlyContribution).toBeNull();
    expect(Number.isFinite(matured.projectedCorpus)).toBe(true);
  });

  it("returns a one-month horizon for a near target date and guards invalid dates", () => {
    const near = goalProjection(
      { ...goal, targetDate: "2025-01-31", currentAmount: 0, monthlyContribution: 0 },
      new Date("2025-01-01T00:00:00")
    );
    expect(near.months).toBe(1);
    expect(near.requiredMonthlyContribution).not.toBeNull();

    const invalid = goalProjection(
      { ...goal, targetDate: "not-a-date" },
      new Date("not-a-date")
    );
    expect(invalid.months).toBe(0);
    expect(Number.isFinite(invalid.projectedCorpus)).toBe(true);
    expect(invalid.requiredMonthlyContribution).toBeNull();
  });

  it("reports exact security/sector HHI and leaves unsupported correlation coverage partial", () => {
    const holdings = [
      { ...h("AAA", "Equity", 50, "Technology"), symbol: "AAA" },
      { ...h("BBB", "Equity", 50, "Technology"), symbol: "BBB" },
    ];
    const measured = Array.from({ length: 5 }, () => Array<number | null>(5).fill(null));
    measured[0]![1] = 0.25;
    const score = scoreDiversification(holdings, measured);
    expect(score.concentration.holdingHHI).toBeCloseTo(0.5, 8);
    expect(score.concentration.holdingHHI10k).toBe(5_000);
    expect(score.concentration.effectiveHoldings).toBeCloseTo(2, 8);
    expect(score.concentration.sectorHHI).toBe(1);
    expect(score.concentration.sectorHHI10k).toBe(10_000);
    expect(score.concentration.topThreeWeightPct).toBe(100);
    expect(score.coveragePct).toBe(82);
    expect(score.breakdown.correlation).toBe(75);

    const unavailable = scoreDiversification(holdings);
    expect(unavailable.coveragePct).toBe(80);
    expect(unavailable.breakdown.correlation).toBeNull();
    expect(scoreDiversification([]).concentration.holdingHHI).toBeNull();
  });

  it("uses the exact shared historical comparison in both reports and Coach answers", () => {
    const observations = Array.from({ length: 12 }, (_, index) => {
      const serial = 2023 * 12 + index,
        month = `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
      return {
        month,
        returns: Object.fromEntries(ASSET_BUCKETS.map(bucket => [bucket, 1])) as Record<
          (typeof ASSET_BUCKETS)[number],
          number
        >,
      };
    });
    const history: HistoricalReturnDataset = {
        sourceType: "user-uploaded",
        verificationStatus: "unverified",
        sourceName: "Unit-test fixture",
        sourceUrl: null,
        uploadedAt: "2026-10-10T00:00:00.000Z",
        currency: "INR",
        frequency: "monthly",
        returnBasis: "total-return",
        startMonth: observations[0]!.month,
        endMonth: observations[observations.length - 1]!.month,
        missingDataTreatment: "No filling; complete monthly observations only.",
        observations,
      },
      comparisonConfig: BacktestConfig = {
        baselineWeights: { Equity: 100, "Mutual Funds": 0, Gold: 0, Debt: 0, Cash: 0 },
        allWeatherWeights: { Equity: 30, "Mutual Funds": 20, Gold: 15, Debt: 30, Cash: 5 },
        rebalanceFrequency: "none",
        transactionCostBps: 10,
        riskFreeAnnualPct: 6,
        startMonth: history.startMonth,
        endMonth: history.endMonth,
      },
      comparison = runHistoricalComparison(history, comparisonConfig);
    expect(comparison?.status).toBe("ready");
    const withHistory = {
        ...sample,
        historicalReturns: history,
        backtestConfig: comparisonConfig,
      },
      report = generatePortfolioReport(withHistory, comparison),
      historicalSection = report.sections.find(
        section => section.heading === "Historical Performance Comparison"
      ),
      coach = deterministicCoachAnswer(
        "What does my backtest show?",
        withHistory,
        comparison
      ),
      cagr = comparison!.baseline!.metrics.cagr.value!.toFixed(2);
    expect(historicalSection?.body).toContain(`Baseline CAGR ${cagr}%`);
    expect(historicalSection?.body).toContain("2023-01 to 2023-12");
    expect(coach).toContain(`baseline CAGR is ${cagr}%`);
    expect(coach).toContain("same complete user-uploaded, unverified monthly window");
  });
});

describe("goal projection edge cases and round-trip", () => {
  const asOf = new Date("2026-10-11T10:00:00");
  const goal = (over: Partial<Goal>): Goal => ({
    id: "g",
    name: "Goal",
    category: "Other",
    targetAmount: 1_000_000,
    currentAmount: 0,
    targetDate: "2036-10-11",
    monthlyContribution: 0,
    expectedReturnPct: 8,
    inflationPct: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("is On Track, with zero shortfall, when saving exactly the required contribution", () => {
    let checked = 0;
    for (const years of [1, 3, 7, 12, 22, 30])
      for (const ret of [-5, 0, 4, 8, 12])
        for (const infl of [0, 3, 6])
          for (const cur of [0, 100_000, 2_500_000])
            for (const tgt of [500_000, 8_000_000, 30_000_000]) {
              const d = new Date(asOf);
              d.setFullYear(d.getFullYear() + years);
              const g = goal({
                targetDate: d.toISOString().slice(0, 10),
                expectedReturnPct: ret,
                inflationPct: infl,
                currentAmount: cur,
                targetAmount: tgt,
              });
              const need = goalProjection(g, asOf).requiredMonthlyContribution;
              if (need === null || need <= 0) continue;
              const p = goalProjection({ ...g, monthlyContribution: need }, asOf);
              expect(p.status).toBe("On Track");
              expect(p.shortfall).toBe(0);
              checked++;
            }
    expect(checked).toBeGreaterThan(500);
  });

  it("matches a hand-computed zero-return, zero-inflation case", () => {
    // 12 months of 1,000 toward 12,000 starting from 0 at 0% return.
    const p = goalProjection(
      goal({
        targetAmount: 12_000,
        targetDate: "2027-10-11",
        monthlyContribution: 1_000,
        expectedReturnPct: 0,
      }),
      new Date("2026-10-11T00:00:00")
    );
    expect(p.months).toBe(12);
    expect(p.projectedCorpus).toBeCloseTo(12_000, 6);
    expect(p.requiredMonthlyContribution).toBeCloseTo(1_000, 6);
    expect(p.status).toBe("On Track");
  });

  it("reports a real shortfall as Behind / Needs Attention, not On Track", () => {
    const base = goal({ targetAmount: 1_000_000, targetDate: "2027-10-11", expectedReturnPct: 0 });
    const half = goalProjection({ ...base, monthlyContribution: 40_000 }, new Date("2026-10-11T00:00:00"));
    expect(half.status).toBe("Behind");
    expect(half.shortfall).toBeGreaterThan(400_000);
    const close = goalProjection({ ...base, monthlyContribution: 70_000 }, new Date("2026-10-11T00:00:00"));
    expect(close.status).toBe("Needs Attention");
  });

  it("handles a target date in the past or an invalid date without NaN", () => {
    const met = goalProjection(goal({ targetDate: "2020-01-01", currentAmount: 2_000_000 }), asOf);
    expect(met.months).toBe(0);
    expect(met.requiredMonthlyContribution).toBe(0);
    expect(met.status).toBe("On Track");
    const unmet = goalProjection(goal({ targetDate: "2020-01-01", currentAmount: 10 }), asOf);
    expect(unmet.requiredMonthlyContribution).toBeNull();
    expect(unmet.status).not.toBe("On Track");
    const bad = goalProjection(goal({ targetDate: "not-a-date" }), asOf);
    for (const v of Object.values(bad)) if (typeof v === "number") expect(Number.isFinite(v)).toBe(true);
  });
});

describe("empty and zero-value portfolios stay finite", () => {
  const allFinite = (v: unknown): boolean =>
    typeof v === "number"
      ? Number.isFinite(v)
      : Array.isArray(v)
        ? v.every(allFinite)
        : v && typeof v === "object"
          ? Object.values(v).every(allFinite)
          : true;
  const targets = { Equity: 40, "Mutual Funds": 20, Gold: 15, Debt: 20, Cash: 5 };
  const tolerances = { Equity: 5, "Mutual Funds": 5, Gold: 5, Debt: 5, Cash: 5 };

  it("allocationReview, assetAllocation and stress give finite numbers for no holdings", () => {
    expect(portfolioTotal([])).toBe(0);
    expect(allFinite(assetAllocation([]))).toBe(true);
    const review = allocationReview([], targets, tolerances);
    expect(allFinite(review)).toBe(true);
    expect(review.every(r => r.currentPct === 0 && r.adjustmentValue === 0)).toBe(true);
    const stress = calculateStress([], scenarioCatalog()[0], sample.goals);
    expect(stress.lossPct).toBe(0);
    expect(allFinite(stress.goalImpacts)).toBe(true);
  });

  it("allocationReview for a zero-value holding does not divide by zero", () => {
    const zero = [h("Z", "Equity", 0)];
    expect(allFinite(allocationReview(zero, targets, tolerances))).toBe(true);
  });
});
