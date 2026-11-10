import { describe, it, expect } from "vitest";
import { calculateRiskArchetype } from "./onboarding";

describe("Risk Archetype Engine", () => {
  it("classifies an ultra-conservative profile accurately", () => {
    const answers = {
      q_horizon: "h1",
      q_emergency_runway: "e1",
      q_income_stability: "i1",
      q_age_stage: "a4",
      q_drawdown_reaction: "d1",
      q_volatility_comfort: "v1",
      q_investing_experience: "x1",
      q_inflation_attitude: "p1",
    };

    const result = calculateRiskArchetype(answers);
    expect(result.compositeScore).toBeLessThanOrEqual(25);
    expect(result.archetype.id).toBe("defensive-capital-preserver");
    expect(result.archetype.tier).toBe("Conservative");
    expect(result.archetype.recommendedEquityPct).toBe(15);
  });

  it("classifies an aggressive wealth maximizer profile accurately", () => {
    const answers = {
      q_horizon: "h4",
      q_emergency_runway: "e4",
      q_income_stability: "i4",
      q_age_stage: "a1",
      q_drawdown_reaction: "d4",
      q_volatility_comfort: "v4",
      q_investing_experience: "x4",
      q_inflation_attitude: "p3",
    };

    const result = calculateRiskArchetype(answers);
    expect(result.compositeScore).toBeGreaterThanOrEqual(86);
    expect(result.archetype.id).toBe("dynamic-wealth-maximizer");
    expect(result.archetype.tier).toBe("Aggressive");
    expect(result.archetype.recommendedEquityPct).toBe(90);
  });

  it("enforces emergency runway safety override when runway is inadequate", () => {
    const answers = {
      q_horizon: "h4",
      q_emergency_runway: "e1",
      q_income_stability: "i4",
      q_age_stage: "a1",
      q_drawdown_reaction: "d4",
      q_volatility_comfort: "v4",
      q_investing_experience: "x4",
      q_inflation_attitude: "p3",
    };

    const result = calculateRiskArchetype(answers);
    expect(result.compositeScore).toBe(65);
    expect(result.archetype.id).toBe("balanced-long-term-grower");
    expect(result.overridesApplied.length).toBeGreaterThan(0);
    expect(result.overridesApplied[0]).toContain("emergency cash runway");
  });

  it("enforces short horizon safety override when horizon is 1-2 years", () => {
    const answers = {
      q_horizon: "h1",
      q_emergency_runway: "e4",
      q_income_stability: "i3",
      q_age_stage: "a2",
      q_drawdown_reaction: "d3",
      q_volatility_comfort: "v3",
      q_investing_experience: "x3",
      q_inflation_attitude: "p3",
    };

    const result = calculateRiskArchetype(answers);
    expect(result.compositeScore).toBe(40);
    expect(result.archetype.id).toBe("cautious-wealth-builder");
    expect(result.overridesApplied.some(o => o.includes("short withdrawal horizon"))).toBe(true);
  });
});
