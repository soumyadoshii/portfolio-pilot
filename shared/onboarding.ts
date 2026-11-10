export type RiskTier =
  | "Conservative"
  | "Moderately Conservative"
  | "Moderate"
  | "Growth"
  | "Aggressive";

export type ArchetypeId =
  | "defensive-capital-preserver"
  | "cautious-wealth-builder"
  | "balanced-long-term-grower"
  | "active-strategic-accumulator"
  | "dynamic-wealth-maximizer";

export interface AssetAllocationBounds {
  equityMin: number;
  equityMax: number;
  debtMin: number;
  debtMax: number;
  cashMin: number;
  cashMax: number;
  alternativesMax: number;
}

export interface InvestorArchetype {
  id: ArchetypeId;
  name: string;
  tier: RiskTier;
  minScore: number;
  maxScore: number;
  tagline: string;
  description: string;
  recommendedEquityPct: number;
  recommendedDebtPct: number;
  recommendedCashPct: number;
  recommendedGoldPct: number;
  bounds: AssetAllocationBounds;
}

export interface QuestionOption {
  id: string;
  text: string;
  capacityPoints: number;
  tolerancePoints: number;
}

export interface AssessmentQuestion {
  id: string;
  dimension: "capacity" | "tolerance";
  prompt: string;
  helpText?: string;
  options: QuestionOption[];
}

export const ARCHETYPES: Record<ArchetypeId, InvestorArchetype> = {
  "defensive-capital-preserver": {
    id: "defensive-capital-preserver",
    name: "Defensive Capital Preserver",
    tier: "Conservative",
    minScore: 0,
    maxScore: 25,
    tagline: "Prioritizing capital preservation and steady cash flow over growth.",
    description:
      "Your primary objective is protecting capital against inflation and market shocks. You prefer guaranteed return instruments, liquid debt, and sovereign bonds with minimal equity fluctuation.",
    recommendedEquityPct: 15,
    recommendedDebtPct: 70,
    recommendedCashPct: 10,
    recommendedGoldPct: 5,
    bounds: {
      equityMin: 10,
      equityMax: 25,
      debtMin: 60,
      debtMax: 85,
      cashMin: 5,
      cashMax: 20,
      alternativesMax: 5,
    },
  },
  "cautious-wealth-builder": {
    id: "cautious-wealth-builder",
    name: "Cautious Wealth Builder",
    tier: "Moderately Conservative",
    minScore: 26,
    maxScore: 50,
    tagline: "Controlled growth with a firm foundation in fixed-income cushions.",
    description:
      "You look for modest growth while keeping downside drawdowns low. You are willing to hold quality blue-chip equities while anchoring the majority of capital in stable fixed income.",
    recommendedEquityPct: 35,
    recommendedDebtPct: 50,
    recommendedCashPct: 10,
    recommendedGoldPct: 5,
    bounds: {
      equityMin: 25,
      equityMax: 45,
      debtMin: 40,
      debtMax: 65,
      cashMin: 5,
      cashMax: 15,
      alternativesMax: 10,
    },
  },
  "balanced-long-term-grower": {
    id: "balanced-long-term-grower",
    name: "Balanced Long-Term Grower",
    tier: "Moderate",
    minScore: 51,
    maxScore: 70,
    tagline: "Equal discipline across wealth compounding and downside insulation.",
    description:
      "You appreciate economic expansion and can withstand standard market drawdowns. You seek an evenly structured portfolio composed of index funds, flexi-cap equities, and quality corporate bonds.",
    recommendedEquityPct: 55,
    recommendedDebtPct: 35,
    recommendedCashPct: 5,
    recommendedGoldPct: 5,
    bounds: {
      equityMin: 45,
      equityMax: 65,
      debtMin: 25,
      debtMax: 45,
      cashMin: 5,
      cashMax: 15,
      alternativesMax: 10,
    },
  },
  "active-strategic-accumulator": {
    id: "active-strategic-accumulator",
    name: "Active Strategic Accumulator",
    tier: "Growth",
    minScore: 71,
    maxScore: 85,
    tagline: "Focused capital expansion tailored for compounding across long horizons.",
    description:
      "You have an ample investment runway and the conviction to treat market corrections as strategic buying windows. Your portfolio leans heavily toward diversified equities.",
    recommendedEquityPct: 75,
    recommendedDebtPct: 15,
    recommendedCashPct: 5,
    recommendedGoldPct: 5,
    bounds: {
      equityMin: 65,
      equityMax: 80,
      debtMin: 10,
      debtMax: 25,
      cashMin: 5,
      cashMax: 10,
      alternativesMax: 15,
    },
  },
  "dynamic-wealth-maximizer": {
    id: "dynamic-wealth-maximizer",
    name: "Dynamic Wealth Maximizer",
    tier: "Aggressive",
    minScore: 86,
    maxScore: 100,
    tagline: "Aggressive multi-decade asset compounding across equities and growth opportunities.",
    description:
      "You possess high risk tolerance, high income stability, and a long time horizon. You are comfortable holding large drawdowns in exchange for superior long-term compounded returns.",
    recommendedEquityPct: 90,
    recommendedDebtPct: 5,
    recommendedCashPct: 5,
    recommendedGoldPct: 0,
    bounds: {
      equityMin: 80,
      equityMax: 95,
      debtMin: 0,
      debtMax: 15,
      cashMin: 5,
      cashMax: 10,
      alternativesMax: 20,
    },
  },
};

export const ONBOARDING_QUESTIONS: AssessmentQuestion[] = [
  {
    id: "q_horizon",
    dimension: "capacity",
    prompt: "When do you realistically expect to begin withdrawing money from this portfolio?",
    options: [
      { id: "h1", text: "Within 1 to 2 years", capacityPoints: 2, tolerancePoints: 0 },
      { id: "h2", text: "In 3 to 5 years", capacityPoints: 6, tolerancePoints: 0 },
      { id: "h3", text: "In 6 to 10 years", capacityPoints: 10, tolerancePoints: 0 },
      { id: "h4", text: "More than 10 years from now", capacityPoints: 15, tolerancePoints: 0 },
    ],
  },
  {
    id: "q_emergency_runway",
    dimension: "capacity",
    prompt: "How many months of fixed living expenses do you hold in safe, liquid savings?",
    options: [
      { id: "e1", text: "Less than 1 month", capacityPoints: 0, tolerancePoints: 0 },
      { id: "e2", text: "1 to 3 months", capacityPoints: 4, tolerancePoints: 0 },
      { id: "e3", text: "3 to 6 months", capacityPoints: 8, tolerancePoints: 0 },
      { id: "e4", text: "More than 6 months of reserves", capacityPoints: 12, tolerancePoints: 0 },
    ],
  },
  {
    id: "q_income_stability",
    dimension: "capacity",
    prompt: "How secure and predictable is your current primary income source?",
    options: [
      { id: "i1", text: "Volatile or irregular (freelance / early startup / commission)", capacityPoints: 2, tolerancePoints: 0 },
      { id: "i2", text: "Somewhat variable with seasonal shifts", capacityPoints: 6, tolerancePoints: 0 },
      { id: "i3", text: "Stable salary or established recurring revenue", capacityPoints: 11, tolerancePoints: 0 },
      { id: "i4", text: "Highly secure with multiple independent income streams", capacityPoints: 13, tolerancePoints: 0 },
    ],
  },
  {
    id: "q_age_stage",
    dimension: "capacity",
    prompt: "What life stage best captures your current financial position?",
    options: [
      { id: "a1", text: "Early career / Building foundations (Age < 30)", capacityPoints: 10, tolerancePoints: 0 },
      { id: "a2", text: "Established career / Mid wealth accumulation (Age 30 - 45)", capacityPoints: 8, tolerancePoints: 0 },
      { id: "a3", text: "Peak earnings / Pre-retirement transition (Age 46 - 60)", capacityPoints: 5, tolerancePoints: 0 },
      { id: "a4", text: "Retirement / Wealth drawdown (Age 60+)", capacityPoints: 2, tolerancePoints: 0 },
    ],
  },
  {
    id: "q_drawdown_reaction",
    dimension: "tolerance",
    prompt: "Suppose your overall portfolio drops 20% over 60 days during a market crash. How do you respond?",
    options: [
      { id: "d1", text: "Liquidate everything to prevent further financial bleeding", capacityPoints: 0, tolerancePoints: 0 },
      { id: "d2", text: "Move significant capital to safer fixed deposits", capacityPoints: 0, tolerancePoints: 4 },
      { id: "d3", text: "Hold tight and wait for market recovery without selling", capacityPoints: 0, tolerancePoints: 9 },
      { id: "d4", text: "View it as a discount sale and deploy additional fresh capital", capacityPoints: 0, tolerancePoints: 15 },
    ],
  },
  {
    id: "q_volatility_comfort",
    dimension: "tolerance",
    prompt: "Which portfolio outcome would you be most comfortable holding over a 1-year period?",
    options: [
      { id: "v1", text: "Best: +7% gain | Worst: 0% loss (Guaranteed principal)", capacityPoints: 0, tolerancePoints: 2 },
      { id: "v2", text: "Best: +14% gain | Worst: -6% loss", capacityPoints: 0, tolerancePoints: 6 },
      { id: "v3", text: "Best: +22% gain | Worst: -15% loss", capacityPoints: 0, tolerancePoints: 11 },
      { id: "v4", text: "Best: +38% gain | Worst: -28% loss", capacityPoints: 0, tolerancePoints: 15 },
    ],
  },
  {
    id: "q_investing_experience",
    dimension: "tolerance",
    prompt: "How familiar are you with equity market cycles and portfolio drawdowns?",
    options: [
      { id: "x1", text: "Completely new to investing; haven't experienced market drops", capacityPoints: 0, tolerancePoints: 2 },
      { id: "x2", text: "Basic experience with mutual funds or fixed deposits", capacityPoints: 0, tolerancePoints: 5 },
      { id: "x3", text: "Experienced investor; held positions through past corrections", capacityPoints: 0, tolerancePoints: 9 },
      { id: "x4", text: "Active investor knowledgeable in derivatives, rebalancing, and macro cycles", capacityPoints: 0, tolerancePoints: 12 },
    ],
  },
  {
    id: "q_inflation_attitude",
    dimension: "tolerance",
    prompt: "When thinking about long-term purchasing power vs nominal stability:",
    options: [
      { id: "p1", text: "I care far more about never seeing my bank balance go down", capacityPoints: 0, tolerancePoints: 1 },
      { id: "p2", text: "I prefer modest gains over inflation with strict downside protection", capacityPoints: 0, tolerancePoints: 4 },
      { id: "p3", text: "I accept short-term fluctuations to comfortably beat inflation long-term", capacityPoints: 0, tolerancePoints: 8 },
    ],
  },
];

export interface EngineResult {
  compositeScore: number;
  capacityScore: number;
  toleranceScore: number;
  archetype: InvestorArchetype;
  overridesApplied: string[];
}

export function calculateRiskArchetype(answers: Record<string, string>): EngineResult {
  let capacityScore = 0;
  let toleranceScore = 0;

  for (const q of ONBOARDING_QUESTIONS) {
    const selectedOptionId = answers[q.id];
    if (!selectedOptionId) continue;
    const option = q.options.find((o) => o.id === selectedOptionId);
    if (!option) continue;

    capacityScore += option.capacityPoints;
    toleranceScore += option.tolerancePoints;
  }

  capacityScore = Math.min(50, Math.max(0, capacityScore));
  toleranceScore = Math.min(50, Math.max(0, toleranceScore));

  let compositeScore = capacityScore + toleranceScore;
  const overridesApplied = [];

  if (answers["q_emergency_runway"] === "e1" || answers["q_emergency_runway"] === "e2") {
    if (compositeScore > 70) {
      compositeScore = 65;
      overridesApplied.push("Capped at Moderate tier due to insufficient emergency cash runway (< 3 months).");
    }
  }

  if (answers["q_horizon"] === "h1") {
    if (compositeScore > 45) {
      compositeScore = 40;
      overridesApplied.push("Capped at Moderately Conservative due to short withdrawal horizon (< 2 years).");
    }
  }

  let resolvedArchetypeKey: ArchetypeId = "balanced-long-term-grower";

  if (compositeScore <= 25) {
    resolvedArchetypeKey = "defensive-capital-preserver";
  } else if (compositeScore <= 50) {
    resolvedArchetypeKey = "cautious-wealth-builder";
  } else if (compositeScore <= 70) {
    resolvedArchetypeKey = "balanced-long-term-grower";
  } else if (compositeScore <= 85) {
    resolvedArchetypeKey = "active-strategic-accumulator";
  } else {
    resolvedArchetypeKey = "dynamic-wealth-maximizer";
  }

  return {
    compositeScore,
    capacityScore,
    toleranceScore,
    archetype: ARCHETYPES[resolvedArchetypeKey],
    overridesApplied,
  };
}
