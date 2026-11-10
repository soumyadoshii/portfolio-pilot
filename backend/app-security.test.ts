import { describe, expect, it } from "vitest";
import { buildMinimalCoachContext, validatePortfolioState } from "./app-security";
import { readAccountState } from "./app-repository";
import { SlidingWindowRateLimiter } from "./app-api";
import {
  createEmptyPortfolioState,
  ASSET_BUCKETS,
  type PortfolioState,
} from "../shared/portfolio";

const state = (
  name: string,
  symbol: string,
  securityName: string
): PortfolioState => ({
  schemaVersion: 1,
  profile: {
    name,
    age: 35,
    employment: "Private identity text",
    annualIncome: 1_000_000,
    monthlyIncome: 80_000,
    monthlyInvestment: 20_000,
    existingAssets: 100_000,
    experience: "Some experience",
    riskProfile: "Moderate",
    riskScore: 50,
  },
  preferences: {
    currency: "INR",
    notificationTypes: {
      goal: true,
      drift: true,
      concentration: true,
      report: true,
      stress: true,
      rebalance: true,
    },
    reportFrequency: "Off",
    aiCoachConsent: true,
    aiReportConsent: false,
  },
  holdings: [
    {
      id: "holding-private-id",
      symbol,
      name: securityName,
      assetType: "Equity",
      sector: "Private sector text",
      geography: "India",
      marketCap: "Large",
      quantity: 2,
      averagePrice: 100,
      currentPrice: 120,
      currentValue: 240,
    },
  ],
  goals: [
    {
      id: "goal-1",
      name: "Private goal title",
      category: "Education",
      targetAmount: 1_000,
      currentAmount: 250,
      targetDate: "2035-01-01",
      monthlyContribution: 20,
      expectedReturnPct: 6,
      inflationPct: 4,
      createdAt: "2025-01-01T00:00:00.000Z",
    },
  ],
  snapshots: [],
  allocationTargets: {
    Equity: 50,
    "Mutual Funds": 20,
    Gold: 10,
    Debt: 15,
    Cash: 5,
  },
  tolerancesPct: { Equity: 5, "Mutual Funds": 5, Gold: 5, Debt: 5, Cash: 5 },
  customScenario: null,
  stressResult: null,
  reports: [],
  notifications: [],
  coachMessages: [],
  dataOrigin: "account",
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
});

describe("PortfolioPilot app security", () => {
  it("creates a valid empty account portfolio with AI consent off by default", () => {
    const initial = createEmptyPortfolioState("New account");
    expect(validatePortfolioState(initial).success).toBe(true);
    expect(initial.profile.name).toBe("New account");
    expect(initial.dataOrigin).toBe("account");
    expect(initial.holdings).toEqual([]);
    expect(initial.preferences.aiCoachConsent).toBe(false);
    expect(initial.preferences.aiReportConsent).toBe(false);
  });

  it("enforces state payload size and bounded holding arrays", () => {
    const valid = state("Me", "HIDE", "Sensitive Security Name");
    expect(validatePortfolioState(valid).success).toBe(true);
    expect(
      validatePortfolioState({
        ...valid,
        goals: [{ ...valid.goals[0]!, category: "Child Education" }],
      }).success
    ).toBe(true);
    expect(
      validatePortfolioState({
        ...valid,
        holdings: Array.from({ length: 101 }, (_, i) => ({
          ...valid.holdings[0]!,
          id: String(i),
        })),
      }).success
    ).toBe(false);
    expect(validatePortfolioState({ junk: "x".repeat(270_000) }).success).toBe(
      false
    );
  });

  it("reads account state strictly by the supplied authenticated owner id", async () => {
    const saved = new Map([
      [11, state("Person One", "ONE", "Security One")],
      [22, state("Person Two", "TWO", "Security Two")],
    ]);
    const requested: number[] = [];
    const repository = {
      getState: async (userId: number) => {
        requested.push(userId);
        return saved.get(userId) ?? null;
      },
    };
    expect(await readAccountState(repository, 11)).toBe(saved.get(11));
    expect(await readAccountState(repository, 22)).toBe(saved.get(22));
    expect(requested).toEqual([11, 22]);
  });

  it("minimizes coach context to numeric aggregates and excludes identity/security labels", () => {
    const account = {
      ...state("Private Person", "SECRET_SYMBOL", "Sensitive Security Name"),
      snapshots: [
        {
          id: "snapshot-1",
          date: "2025-01-01",
          label: "Earlier private label",
          totalValue: 10_000,
          source: "manual" as const,
        },
        {
          id: "snapshot-2",
          date: "2026-01-01",
          label: "Latest private label",
          totalValue: 11_000,
          source: "manual" as const,
        },
      ],
    };
    const serialized = JSON.stringify(
      buildMinimalCoachContext(account)
    );
    for (const forbidden of [
      "Private Person",
      "Private identity text",
      "SECRET_SYMBOL",
      "Sensitive Security Name",
      "Private sector text",
      "holding-private-id",
      "Private goal title",
      "Earlier private label",
      "Latest private label",
    ])
      expect(serialized).not.toContain(forbidden);
    expect(serialized).toContain("portfolioValueINR");
    expect(serialized).toContain("progressPct");
    expect(JSON.parse(serialized)).toMatchObject({
      monthlyInvestmentINR: 20_000,
      monthlyGoalContributionsINR: 20,
      snapshotChangeINR: 1_000,
      snapshotChangePct: 10,
    });
  });

  it("validates monthly-history provenance and shares only computed backtest aggregates with AI", () => {
    const observations = Array.from({ length: 12 }, (_, index) => {
      const serial = 2024 * 12 + index,
        month = `${Math.floor(serial / 12)}-${String((serial % 12) + 1).padStart(2, "0")}`;
      return {
        month,
        returns: Object.fromEntries(
          ASSET_BUCKETS.map(bucket => [bucket, index % 2 === 0 ? 1 : -0.5])
        ) as Record<(typeof ASSET_BUCKETS)[number], number>,
      };
    });
    const account = {
      ...state("Private Person", "SECRET_SYMBOL", "Sensitive Security Name"),
      historicalReturns: {
        sourceType: "user-uploaded" as const,
        verificationStatus: "unverified" as const,
        sourceName: "Private source label",
        sourceUrl: "https://private.example/returns.csv",
        uploadedAt: "2026-10-10T00:00:00.000Z",
        currency: "INR" as const,
        frequency: "monthly" as const,
        returnBasis: "total-return" as const,
        startMonth: observations[0]!.month,
        endMonth: observations[observations.length - 1]!.month,
        missingDataTreatment: "No filling; complete monthly observations only.",
        observations,
      },
      backtestConfig: {
        baselineWeights: { Equity: 50, "Mutual Funds": 20, Gold: 10, Debt: 15, Cash: 5 },
        allWeatherWeights: { Equity: 30, "Mutual Funds": 20, Gold: 15, Debt: 30, Cash: 5 },
        rebalanceFrequency: "quarterly" as const,
        transactionCostBps: 10,
        riskFreeAnnualPct: 6,
        startMonth: observations[0]!.month,
        endMonth: observations[observations.length - 1]!.month,
      },
    } satisfies PortfolioState;
    expect(validatePortfolioState(account).success).toBe(true);

    const context = buildMinimalCoachContext(account),
      serialized = JSON.stringify(context);
    expect(context.historicalBacktest).toMatchObject({
      status: "ready",
      sourceVerification: "unverified",
      observations: 12,
      baseline: { totalReturnPct: expect.any(Number), cagrPct: expect.any(Number) },
      allWeatherInspired: { annualizedVolatilityPct: expect.any(Number) },
    });
    expect(serialized).not.toContain("Private source label");
    expect(serialized).not.toContain("https://private.example/returns.csv");
    expect(serialized).not.toContain('"observations":[{"month"');
    expect(serialized).not.toContain("SECRET_SYMBOL");

    const duplicate = {
      ...account,
      historicalReturns: {
        ...account.historicalReturns,
        observations: [account.historicalReturns.observations[0]!, account.historicalReturns.observations[0]!],
      },
    };
    expect(validatePortfolioState(duplicate).success).toBe(false);
    expect(
      validatePortfolioState({
        ...account,
        historicalReturns: {
          ...account.historicalReturns,
          sourceUrl: "http://private.example/returns.csv",
        },
      }).success
    ).toBe(false);
    expect(
      validatePortfolioState({
        ...account,
        historicalReturns: {
          ...account.historicalReturns,
          observations: account.historicalReturns.observations.map((observation, index) =>
            index === 0
              ? { ...observation, returns: { ...observation.returns, Equity: -100 } }
              : observation
          ),
        },
      }).success
    ).toBe(false);
  });

  it("observes exact sliding-window rate-limit boundaries", () => {
    let now = 1000;
    const limiter = new SlidingWindowRateLimiter(2, 10_000, () => now);
    expect(limiter.consume("ip").allowed).toBe(true);
    expect(limiter.consume("ip").allowed).toBe(true);
    const blocked = limiter.consume("ip");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(10);
    now = 11_001;
    expect(limiter.consume("ip").allowed).toBe(true);
  });
});