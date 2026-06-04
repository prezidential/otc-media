import { describe, it, expect } from "vitest";
import {
  evalStandard,
  evalInverted,
  evaluateMetric,
  getISOWeek,
  type KpiConfig,
} from "@/lib/subscriber-health/kpi";

describe("KPI evaluation", () => {
  const cfg: KpiConfig = { target: 10, warn: 5 };

  it("evalStandard: green when value >= target", () => {
    expect(evalStandard(10, cfg)).toBe("green");
    expect(evalStandard(15, cfg)).toBe("green");
  });

  it("evalStandard: yellow when warn <= value < target", () => {
    expect(evalStandard(5, cfg)).toBe("yellow");
    expect(evalStandard(9, cfg)).toBe("yellow");
  });

  it("evalStandard: red when value < warn", () => {
    expect(evalStandard(4, cfg)).toBe("red");
    expect(evalStandard(0, cfg)).toBe("red");
  });

  const inv: KpiConfig = { target: 3, warn: 6 };

  it("evalInverted: green when value <= target", () => {
    expect(evalInverted(3, inv)).toBe("green");
    expect(evalInverted(1, inv)).toBe("green");
  });

  it("evalInverted: yellow when target < value <= warn", () => {
    expect(evalInverted(4, inv)).toBe("yellow");
    expect(evalInverted(6, inv)).toBe("yellow");
  });

  it("evalInverted: red when value > warn", () => {
    expect(evalInverted(7, inv)).toBe("red");
    expect(evalInverted(20, inv)).toBe("red");
  });

  it("evaluateMetric: uses inverted logic for boostSourcedPercent and monthlyChurnRate", () => {
    expect(evaluateMetric("monthlyChurnRate", 2, { target: 3, warn: 6 })).toBe("green");
    expect(evaluateMetric("monthlyChurnRate", 8, { target: 3, warn: 6 })).toBe("red");
    expect(evaluateMetric("boostSourcedPercent", 0, { target: 0, warn: 5 })).toBe("green");
    // standard metric uses higher-is-better
    expect(evaluateMetric("openRate", 50, { target: 65, warn: 60 })).toBe("red");
  });
});

describe("ISO week number", () => {
  it("computes the ISO week containing the first Thursday", () => {
    expect(getISOWeek(new Date(Date.UTC(2026, 0, 1)))).toBe(1); // Thu 2026-01-01
    expect(getISOWeek(new Date(Date.UTC(2026, 5, 4)))).toBe(23);
  });
});
