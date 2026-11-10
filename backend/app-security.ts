import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { z } from "zod";
import type { PortfolioState } from "../shared/portfolio";
import {
  assetAllocation,
  deterministicCoachAnswer as financeCoachAnswer,
  goalProjection,
  portfolioTotal,
} from "../shared/finance";
import {
  calculateReturnCorrelations,
  runHistoricalComparison,
} from "../shared/backtest";

const scrypt = (
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number; maxmem: number }
) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCallback(password, salt, length, options, (error, value) =>
      error ? reject(error) : resolve(value as Buffer)
    )
  );
const SCRYPT_BYTES = 64;
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  })) as Buffer;
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (
    parts.length !== 3 ||
    parts[0] !== "scrypt" ||
    !/^[\da-f]{32}$/i.test(parts[1]!) ||
    !/^[\da-f]{128}$/i.test(parts[2]!)
  )
    return false;
  const salt = Buffer.from(parts[1]!, "hex");
  const expected = Buffer.from(parts[2]!, "hex");
  try {
    const actual = (await scrypt(password, salt, expected.length, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: 64 * 1024 * 1024,
    })) as Buffer;
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}

export const sessionTokenHash = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

const finite = z
  .number()
  .finite()
  .min(-1_000_000_000_000)
  .max(1_000_000_000_000);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const idText = z.string().min(1).max(128);
const dateText = z
  .string()
  .min(1)
  .max(40)
  .refine(value => Number.isFinite(Date.parse(value)));
const assetBuckets = [
  "Equity",
  "Mutual Funds",
  "Gold",
  "Debt",
  "Cash",
] as const;
const assetTypes = [
  "Equity",
  "Mutual Fund",
  "ETF",
  "Gold",
  "Debt",
  "Cash",
] as const;
const holding = z.object({
  id: idText,
  symbol: shortText(32),
  name: shortText(120),
  assetType: z.enum(assetTypes),
  sector: z.string().max(80),
  geography: z.string().max(80),
  marketCap: z.enum(["Large", "Mid", "Small", "Not specified"]),
  quantity: finite.min(0),
  averagePrice: finite.min(0),
  currentPrice: finite.min(0),
  currentValue: finite.min(0),
  returnAssumptionPct: finite.optional(),
});
const goal = z.object({
  id: idText,
  name: shortText(120),
  category: z.enum([
    "Retirement",
    "Education",
    "Home",
    "Home Purchase",
    "Child Education",
    "Emergency Fund",
    "Vehicle",
    "Travel",
    "Wealth",
    "Wealth Creation",
    "Custom Goal",
    "Other",
  ]),
  targetAmount: finite.min(0),
  currentAmount: finite.min(0),
  targetDate: dateText,
  monthlyContribution: finite.min(0),
  expectedReturnPct: finite.min(-100).max(100),
  inflationPct: finite.min(-100).max(100),
  createdAt: dateText,
});
const stressScenario = z.object({
  id: idText,
  name: shortText(100),
  description: z.string().max(600),
  returnsPct: z.record(z.enum(assetBuckets), finite.min(-100).max(100)),
  recoveryMonths: z.number().int().min(0).max(1200),
  isCustom: z.boolean(),
});
const allocation = z.record(z.enum(assetBuckets), finite.min(0).max(100));
const monthText = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const monthlyReturnValue = z.number().finite().gt(-100).max(500).nullable();
const monthlyReturns = z.object({
  Equity: monthlyReturnValue,
  "Mutual Funds": monthlyReturnValue,
  Gold: monthlyReturnValue,
  Debt: monthlyReturnValue,
  Cash: monthlyReturnValue,
});
const historicalReturns = z
  .object({
    sourceType: z.literal("user-uploaded"),
    verificationStatus: z.literal("unverified"),
    sourceName: shortText(120),
    sourceUrl: z
      .string()
      .max(500)
      .refine(value => {
        try {
          return new URL(value).protocol === "https:";
        } catch {
          return false;
        }
      })
      .nullable(),
    uploadedAt: dateText,
    currency: z.literal("INR"),
    frequency: z.literal("monthly"),
    returnBasis: z.enum(["total-return", "price-only", "unknown"]),
    startMonth: monthText,
    endMonth: monthText,
    missingDataTreatment: shortText(300),
    observations: z
      .array(z.object({ month: monthText, returns: monthlyReturns }))
      .min(1)
      .max(360),
  })
  .superRefine((dataset, ctx) => {
    const months = dataset.observations.map(row => row.month);
    if (new Set(months).size !== months.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate return month." });
    if (
      months.some((month, index) => index > 0 && month <= months[index - 1]!)
    )
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Return months must be ordered." });
    if (months[0] !== dataset.startMonth || months[months.length - 1] !== dataset.endMonth)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Return date range must match the observations." });
  });
const backtestWeights = z.object({
  Equity: finite.min(0).max(100),
  "Mutual Funds": finite.min(0).max(100),
  Gold: finite.min(0).max(100),
  Debt: finite.min(0).max(100),
  Cash: finite.min(0).max(100),
});
const backtestConfig = z
  .object({
    baselineWeights: backtestWeights,
    allWeatherWeights: backtestWeights,
    rebalanceFrequency: z.enum(["monthly", "quarterly", "annual", "none"]),
    transactionCostBps: finite.min(0).max(1000),
    riskFreeAnnualPct: finite.gt(-100).max(100),
    startMonth: monthText,
    endMonth: monthText,
  })
  .superRefine((config, ctx) => {
    for (const [label, weights] of [
      ["baseline", config.baselineWeights],
      ["All-Weather-inspired", config.allWeatherWeights],
    ] as const) {
      const total = assetBuckets.reduce((sum, bucket) => sum + weights[bucket], 0);
      if (Math.abs(total - 100) > 0.05)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${label} target weights must sum to 100%.`,
        });
    }
    if (config.startMonth > config.endMonth)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Backtest start month must not follow end month." });
  });
  
const riskAssessment = z
  .object({
    questionnaireVersion: shortText(40),
    answers: z.record(
      z.string().min(1).max(128),
      z.string().min(1).max(128)
    ),
    assessedAt: dateText,
    capacityScore: finite.min(0).max(50),
    toleranceScore: finite.min(0).max(50),
    compositeScore: finite.min(0).max(100),
    archetypeId: idText,
    overridesApplied: z.array(z.string().max(500)).max(50),
  })
  .strict();

const portfolioStateSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({
    name: shortText(100),
    age: z.number().int().min(18).max(120).nullable(),
    employment: z.string().max(120),
    annualIncome: finite.min(0),
    monthlyIncome: finite.min(0),
    monthlyInvestment: finite.min(0),
    existingAssets: finite.min(0),
    experience: z.enum([
      "New",
      "Some experience",
      "Experienced",
      "Professional",
      "",
    ]),
    riskProfile: z
      .enum([
        "Conservative",
        "Moderately Conservative",
        "Moderate",
        "Growth",
        "Aggressive",
      ])
      .nullable(),
    riskScore: finite.min(0).max(100).nullable(),
    // Written by the onboarding questionnaire. Without these, zod strips them and
    // the risk tier, archetype and preferences never reach the database.
    riskTier: z.string().max(64).optional(),
    archetype: z.string().max(128).optional(),
    totalInvestable: finite.min(0).optional(),
    preferences: z.object({ tags: z.array(z.string().max(80)).max(20) }).optional(),
    targetAllocation: z
      .object({
        equity: finite.min(0).max(100),
        debt: finite.min(0).max(100),
        cash: finite.min(0).max(100),
        gold: finite.min(0).max(100),
      })
      .optional(),
     riskAssessment: riskAssessment.optional(),
  }),
  preferences: z.object({
    currency: z.literal("INR"),
    notificationTypes: z.record(
      z.enum([
        "goal",
        "drift",
        "concentration",
        "report",
        "stress",
        "rebalance",
      ]),
      z.boolean()
    ),
    reportFrequency: z.enum(["Off", "Monthly", "Quarterly"]),
    aiCoachConsent: z.boolean(),
    aiReportConsent: z.boolean(),
  }),
  holdings: z.array(holding).max(100),
  goals: z.array(goal).max(50),
  snapshots: z
    .array(
      z.object({
        id: idText,
        date: dateText,
        label: shortText(100),
        totalValue: finite.min(0),
        source: z.enum(["demo", "import", "manual"]),
      })
    )
    .max(500),
  allocationTargets: allocation,
  tolerancesPct: z.record(z.enum(assetBuckets), finite.min(0).max(100)),
  customScenario: stressScenario.nullable(),
  stressResult: z
    .object({
      scenarioId: idText,
      scenarioName: shortText(100),
      assumptions: z.record(z.enum(assetBuckets), finite.min(-100).max(100)),
      beforeValue: finite.min(0),
      afterValue: finite.min(0),
      changeValue: finite,
      lossPct: finite.min(-100).max(100),
      recoveryMonths: z.number().int().min(0).max(1200),
      holdingImpacts: z
        .array(
          z.object({
            holdingId: idText,
            name: shortText(120),
            symbol: shortText(32),
            beforeValue: finite.min(0),
            changeValue: finite,
            afterValue: finite.min(0),
          })
        )
        .max(100),
      goalImpacts: z
        .array(
          z.object({
            goalId: idText,
            goalName: shortText(120),
            beforeCorpus: finite.min(0),
            afterCorpus: finite.min(0),
            additionalMonthlyContribution: finite.min(0).nullable(),
          })
        )
        .max(50),
      createdAt: dateText,
    })
    .nullable(),
  reports: z
    .array(
      z.object({
        id: idText,
        createdAt: dateText,
        title: shortText(160),
        sections: z
          .array(
            z.object({ heading: shortText(120), body: z.string().max(6000) })
          )
          .max(20),
        aiCommentary: z.string().max(2000).optional(),
        commentarySource: z.enum(["deterministic", "ai"]),
      })
    )
    .max(100),
  notifications: z
    .array(
      z.object({
        id: idText,
        type: z.enum([
          "goal",
          "drift",
          "concentration",
          "report",
          "stress",
          "rebalance",
        ]),
        title: shortText(160),
        message: z.string().max(1000),
        createdAt: dateText,
        read: z.boolean(),
      })
    )
    .max(500),
  coachMessages: z
    .array(
      z.object({
        id: idText,
        question: z.string().max(600),
        answer: z.string().max(2000),
        source: z.enum(["deterministic", "ai"]),
        createdAt: dateText,
      })
    )
    .max(100),
  dataOrigin: z.enum(["demo", "import", "manual", "account"]),
  historicalReturns: historicalReturns.nullable().optional(),
  backtestConfig: backtestConfig.nullable().optional(),
  createdAt: dateText,
  updatedAt: dateText,
});

export function validatePortfolioState(
  input: unknown
): { success: true; data: PortfolioState } | { success: false; error: string } {
  try {
    const encoded = JSON.stringify(input);
    if (
      typeof encoded !== "string" ||
      Buffer.byteLength(encoded, "utf8") > 256 * 1024
    )
      return {
        success: false,
        error: "State must be valid JSON no larger than 256 KB.",
      };
    const parsed = portfolioStateSchema.safeParse(input);
    if (!parsed.success)
      return {
        success: false,
        error: "Portfolio state is invalid or exceeds supported limits.",
      };
    return { success: true, data: parsed.data as PortfolioState };
  } catch {
    return {
      success: false,
      error: "State must be valid JSON no larger than 256 KB.",
    };
  }
}

/** Aggregate numeric facts only; never emit identity, free-text profile, or security identifiers. */
export function buildMinimalCoachContext(state: PortfolioState) {
  const totalValue = portfolioTotal(state.holdings),
    comparison = runHistoricalComparison(
      state.historicalReturns,
      state.backtestConfig
    ),
    correlation = calculateReturnCorrelations(state.historicalReturns),
    strategySummary = (
      strategy: NonNullable<typeof comparison>["baseline"]
    ) =>
      strategy && {
        totalReturnPct: strategy.metrics.totalReturn.value,
        cagrPct: strategy.metrics.cagr.value,
        annualizedVolatilityPct:
          strategy.metrics.annualizedVolatility.value,
        sharpeRatio: strategy.metrics.sharpeRatio.value,
        maximumDrawdownPct: strategy.metrics.maximumDrawdown.value,
        recoveryMonths: strategy.metrics.recoveryPeriod.value,
        recoveryStatus: strategy.metrics.recoveryPeriod.status,
      };
  const investedCost = state.holdings.reduce(
    (sum, h) => sum + h.quantity * h.averagePrice,
    0
  );
  const buckets = assetAllocation(state.holdings);
  const assetWeightsPct = Object.fromEntries(
    Object.entries(buckets).map(([key, value]) => [
      key,
      totalValue ? Math.round((value / totalValue) * 1000) / 10 : 0,
    ])
  );
  const goals = state.goals.map(g => {
    const projection = goalProjection(g);
    return {
      targetAmount: g.targetAmount,
      currentAmount: g.currentAmount,
      progressPct: Math.round(projection.progressPct * 10) / 10,
      projectedCorpus: Math.round(projection.projectedCorpus * 100) / 100,
      inflationAdjustedTarget:
        Math.round(projection.targetInflationAdjusted * 100) / 100,
      months: projection.months,
    };
  });
  const weights = state.holdings
    .map(h => (totalValue ? h.currentValue / totalValue : 0))
    .sort((a, b) => b - a),
    snapshots = state.snapshots.slice().sort((a, b) => a.date.localeCompare(b.date)),
    previousSnapshot = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null,
    latestSnapshot = snapshots.length ? snapshots[snapshots.length - 1] : null,
    snapshotChange =
      previousSnapshot && latestSnapshot
        ? latestSnapshot.totalValue - previousSnapshot.totalValue
        : null;
  return {
    portfolioValueINR: Math.round(totalValue * 100) / 100,
    gainLossINR: Math.round((totalValue - investedCost) * 100) / 100,
    monthlyInvestmentINR: Math.round(state.profile.monthlyInvestment * 100) / 100,
    monthlyGoalContributionsINR:
      Math.round(
        state.goals.reduce((sum, goal) => sum + goal.monthlyContribution, 0) *
          100
      ) / 100,
    snapshotCount: snapshots.length,
    latestSnapshotValueINR: latestSnapshot?.totalValue ?? null,
    previousSnapshotValueINR: previousSnapshot?.totalValue ?? null,
    snapshotChangeINR: snapshotChange,
    snapshotChangePct:
      snapshotChange !== null && previousSnapshot?.totalValue
        ? Math.round((snapshotChange / previousSnapshot.totalValue) * 1000) / 10
        : null,
    historicalBacktest: comparison
      ? {
          status: comparison.status,
          message: comparison.message,
          sourceVerification: comparison.source.verificationStatus,
          returnBasis: comparison.source.returnBasis,
          startMonth: comparison.source.commonStartMonth,
          endMonth: comparison.source.commonEndMonth,
          observations: comparison.source.nObs,
          baseline: strategySummary(comparison.baseline),
          allWeatherInspired: strategySummary(comparison.allWeather),
          assumptions: {
            rebalanceFrequency: comparison.assumptions.rebalanceFrequency,
            transactionCostBps: comparison.assumptions.transactionCostBps,
            riskFreeAnnualPct: comparison.assumptions.riskFreeAnnualPct,
            survivorshipLimitations:
              comparison.assumptions.survivorshipLimitations,
          },
          warnings: comparison.warnings,
        }
      : {
          status: state.historicalReturns ? "not-run" : "not-uploaded",
          returnBasis: state.historicalReturns?.returnBasis ?? null,
          observations: state.historicalReturns?.observations.length ?? 0,
          message: "No computed historical comparison is available.",
        },
    uploadedReturnCorrelations: correlation
      ? {
          sourceVerification: correlation.verificationStatus,
          startMonth: correlation.startMonth,
          endMonth: correlation.endMonth,
          minimumObservations: correlation.minimumObservations,
          matrix: correlation.values,
          pairObservationCounts: correlation.pairObservationCounts,
        }
      : null,
    assetWeightsPct,
    largestHoldingWeightPct: Math.round((weights[0] ?? 0) * 1000) / 10,
    topThreeHoldingWeightsPct:
      Math.round(weights.slice(0, 3).reduce((sum, n) => sum + n, 0) * 1000) /
      10,
    riskProfile: state.profile.riskProfile,
    goals,
    goalCount: goals.length,
  };
}

export function deterministicCoachAnswer(
  state: PortfolioState,
  question = "portfolio"
): string {
  const c = buildMinimalCoachContext(state),
    comparison = runHistoricalComparison(
      state.historicalReturns,
      state.backtestConfig
    );
  const answer = financeCoachAnswer(question, state, comparison);
  const leading =
    c.portfolioValueINR > 0
      ? ` Saved portfolio value: ₹${c.portfolioValueINR.toLocaleString("en-IN", { maximumFractionDigits: 0 })}.`
      : " Saved portfolio has no recorded holding value yet.";
  return `${answer}${leading} Calculations use saved state only; assumptions are illustrative and uncertain. This is educational analysis, not personalized investment advice.`.slice(
    0,
    1800
  );
}