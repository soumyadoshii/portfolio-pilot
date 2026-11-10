export const ASSET_BUCKETS = [
  "Equity",
  "Mutual Funds",
  "Gold",
  "Debt",
  "Cash",
] as const;

export type AssetBucket = (typeof ASSET_BUCKETS)[number];

export const ASSET_TYPES = [
  "Equity",
  "Mutual Fund",
  "ETF",
  "Gold",
  "Debt",
  "Cash",
] as const;

export type AssetType = (typeof ASSET_TYPES)[number];

export type RiskProfile =
  | "Conservative"
  | "Moderately Conservative"
  | "Moderate"
  | "Growth"
  | "Aggressive";

export const GOAL_CATEGORIES = [
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
] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];

export type DataOrigin = "demo" | "import" | "manual" | "account";

export type NotificationType =
  | "goal"
  | "drift"
  | "concentration"
  | "report"
  | "stress"
  | "rebalance";

/**
 * Allocation recommendations produced by the risk-profile engine.
 * These are educational targets, not trade instructions.
 */
export interface RiskTargetAllocation {
  equity: number;
  debt: number;
  cash: number;
  gold: number;
}

/** Optional preferences captured during onboarding. */
export interface ProfilePreferences {
  tags: string[];
}

/**
 * Persisted inputs and outputs of a deterministic risk assessment.
 * Keeping the answers allows the assessment to be reproduced and explained.
 */
export interface RiskAssessment {
  questionnaireVersion: string;
  answers: Record<string, string>;
  assessedAt: string;
  capacityScore: number;
  toleranceScore: number;
  compositeScore: number;
  archetypeId: string;
  overridesApplied: string[];
}

export interface UserProfile {
  name: string;
  age: number | null;
  employment: string;
  annualIncome: number;
  monthlyIncome: number;
  monthlyInvestment: number;
  existingAssets: number;
  experience: "New" | "Some experience" | "Experienced" | "Professional" | "";
  riskProfile: RiskProfile | null;
  riskScore: number | null;

  /** Optional onboarding-derived fields; absent in legacy saved profiles. */
  riskTier?: RiskProfile;
  archetype?: string;
  preferences?: ProfilePreferences;
  targetAllocation?: RiskTargetAllocation;
  riskAssessment?: RiskAssessment;
}

export interface UserPreferences {
  currency: "INR";
  notificationTypes: Record<NotificationType, boolean>;
  reportFrequency: "Off" | "Monthly" | "Quarterly";
  aiCoachConsent: boolean;
  aiReportConsent: boolean;
}

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  sector: string;
  geography: string;
  marketCap: "Large" | "Mid" | "Small" | "Not specified";
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  /** Current market value in INR; synthetic for demo, user supplied/calculated for imports. */
  currentValue: number;
  /** Optional annualized assumption in percentage points, not a forecast. */
  returnAssumptionPct?: number;
}

export interface Goal {
  id: string;
  name: string;
  category: GoalCategory;
  targetAmount: number;
  currentAmount: number;
  targetDate: string;
  monthlyContribution: number;
  expectedReturnPct: number;
  inflationPct: number;
  createdAt: string;
}

export interface PortfolioSnapshot {
  id: string;
  date: string;
  label: string;
  totalValue: number;
  source: "demo" | "import" | "manual";
}

export interface StressScenario {
  id: string;
  name: string;
  description: string;
  /** Asset-class returns in percentage points (e.g. -35 means a 35% decline). */
  returnsPct: Record<AssetBucket, number>;
  recoveryMonths: number;
  isCustom: boolean;
}

export interface HoldingImpact {
  holdingId: string;
  name: string;
  symbol: string;
  beforeValue: number;
  changeValue: number;
  afterValue: number;
}

export interface GoalStressImpact {
  goalId: string;
  goalName: string;
  beforeCorpus: number;
  afterCorpus: number;
  additionalMonthlyContribution: number | null;
}

export interface StressResult {
  scenarioId: string;
  scenarioName: string;
  assumptions: Record<AssetBucket, number>;
  beforeValue: number;
  afterValue: number;
  changeValue: number;
  lossPct: number;
  recoveryMonths: number;
  holdingImpacts: HoldingImpact[];
  goalImpacts: GoalStressImpact[];
  createdAt: string;
}

export type Allocation = Record<AssetBucket, number>;

export interface PortfolioReport {
  id: string;
  createdAt: string;
  title: string;
  sections: Array<{ heading: string; body: string }>;
  aiCommentary?: string;
  commentarySource: "deterministic" | "ai";
}

export interface PortfolioNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface CoachMessage {
  id: string;
  question: string;
  answer: string;
  source: "deterministic" | "ai";
  createdAt: string;
}

export type HistoricalReturnBasis =
  | "total-return"
  | "price-only"
  | "unknown";

export type RebalanceFrequency =
  | "monthly"
  | "quarterly"
  | "annual"
  | "none";

/** One calendar month's simple asset-bucket return, in percentage points. */
export interface MonthlyReturnObservation {
  month: string;
  returns: Record<AssetBucket, number | null>;
}

/** User-provided market-history metadata; upload origin is not independent verification. */
export interface HistoricalReturnDataset {
  sourceType: "user-uploaded";
  verificationStatus: "unverified";
  sourceName: string;
  sourceUrl: string | null;
  uploadedAt: string;
  currency: "INR";
  frequency: "monthly";
  returnBasis: HistoricalReturnBasis;
  startMonth: string;
  endMonth: string;
  missingDataTreatment: string;
  observations: MonthlyReturnObservation[];
}

/** Both strategies share every backtest convention other than target weights. */
export interface BacktestConfig {
  baselineWeights: Allocation;
  allWeatherWeights: Allocation;
  rebalanceFrequency: RebalanceFrequency;
  transactionCostBps: number;
  riskFreeAnnualPct: number;
  startMonth: string;
  endMonth: string;
}

/** Canonical account/demo state; user identity and sessions are kept outside this payload. */
export interface PortfolioState {
  schemaVersion: 1;
  profile: UserProfile;
  preferences: UserPreferences;
  holdings: Holding[];
  goals: Goal[];
  snapshots: PortfolioSnapshot[];
  allocationTargets: Allocation;
  tolerancesPct: Record<AssetBucket, number>;
  customScenario: StressScenario | null;
  stressResult: StressResult | null;
  reports: PortfolioReport[];
  notifications: PortfolioNotification[];
  coachMessages: CoachMessage[];
  dataOrigin: DataOrigin;

  /** Optional for legacy saved accounts; there is no default or synthetic return history. */
  historicalReturns?: HistoricalReturnDataset | null;

  /** Optional reproducible comparison settings; metrics are always recalculated by the shared engine. */
  backtestConfig?: BacktestConfig | null;

  createdAt: string;
  updatedAt: string;
}

export interface AccountUser {
  id: number;
  name: string;
  email: string;
}

export interface AccountSessionInfo {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  userAgent: string;
}

/** Create a valid empty portfolio for a new account or local workspace. */
export function createEmptyPortfolioState(
  name = "",
  origin: DataOrigin = "account"
): PortfolioState {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    profile: {
      name,
      age: null,
      employment: "",
      annualIncome: 0,
      monthlyIncome: 0,
      monthlyInvestment: 0,
      existingAssets: 0,
      experience: "",
      riskProfile: null,
      riskScore: null,
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
      aiCoachConsent: false,
      aiReportConsent: false,
    },
    holdings: [],
    goals: [],
    snapshots: [],
    allocationTargets: {
      Equity: 40,
      "Mutual Funds": 25,
      Gold: 10,
      Debt: 20,
      Cash: 5,
    },
    tolerancesPct: {
      Equity: 5,
      "Mutual Funds": 5,
      Gold: 4,
      Debt: 5,
      Cash: 3,
    },
    customScenario: null,
    stressResult: null,
    reports: [],
    notifications: [],
    coachMessages: [],
    dataOrigin: origin,
    historicalReturns: null,
    backtestConfig: null,
    createdAt: now,
    updatedAt: now,
  };
}
