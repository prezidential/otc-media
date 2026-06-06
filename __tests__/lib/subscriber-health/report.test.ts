import { describe, it, expect } from "vitest";
import { formatReport, type ReportMetrics } from "@/lib/subscriber-health/report";
import type { KpiConfigMap, KpiStatus } from "@/lib/subscriber-health/kpi";

const KPIS: KpiConfigMap = {
  weeklyNewSubs: { target: 10, warn: 5 },
  linkedInSourcedPercent: { target: 70, warn: 40 },
  boostSourcedPercent: { target: 0, warn: 5 },
  monthlyChurnRate: { target: 3, warn: 6 },
  openRate: { target: 65, warn: 60 },
  clickRate: { target: 2, warn: 1 },
  paidSubscribers: { target: 25, warn: 13 },
};

function metric(value: number, status: KpiStatus, consecutiveWeeksBelow = 0) {
  return { value, status, consecutiveWeeksBelow };
}

function greenMetrics(): ReportMetrics {
  return {
    weeklyNewSubs: metric(12, "green"),
    linkedInSourcedPercent: metric(80, "green"),
    boostSourcedPercent: metric(0, "green"),
    monthlyChurnRate: metric(2, "green"),
    openRate: metric(70, "green"),
    clickRate: metric(3, "green"),
    paidSubscribers: metric(30, "green"),
  };
}

const base = { date: "2026-06-04", weekNumber: 23, kpis: KPIS };

describe("Telegram message formatting", () => {
  it("includes all 3 sections: Growth, Retention, Monetization", () => {
    const msg = formatReport({ ...base, metrics: greenMetrics() });
    expect(msg).toContain("📈 Growth");
    expect(msg).toContain("💔 Retention");
    expect(msg).toContain("💰 Monetization");
  });

  it("shows correct status emoji per metric status", () => {
    const metrics = greenMetrics();
    metrics.openRate = metric(58, "yellow");
    metrics.clickRate = metric(0.5, "red");
    const msg = formatReport({ ...base, metrics });
    expect(msg).toMatch(/New subs \(7d\): 12 ✅/);
    expect(msg).toMatch(/Open rate \(last 3\): 58% 🟡/);
    expect(msg).toMatch(/Click rate \(last 3\): 0\.5% 🔴/);
  });

  it("appends consecutive-week warning when consecutiveWeeksBelow >= 3", () => {
    const metrics = greenMetrics();
    metrics.openRate = metric(40, "red", 3);
    const msg = formatReport({ ...base, metrics });
    expect(msg).toContain("⚠️ Open rate below warn threshold for 3 consecutive weeks");
  });

  it("does not append warning when consecutiveWeeksBelow < 3", () => {
    const metrics = greenMetrics();
    metrics.openRate = metric(40, "red", 2);
    const msg = formatReport({ ...base, metrics });
    expect(msg).not.toContain("consecutive weeks");
  });

  it("omits dashboard footer when CORNERSTONE_URL is not set", () => {
    const metrics = greenMetrics();
    metrics.clickRate = metric(0.5, "red"); // a red metric exists
    const msg = formatReport({ ...base, metrics });
    expect(msg).not.toContain("📌 Dashboard");
  });

  it("includes dashboard footer when a metric is red and CORNERSTONE_URL is set", () => {
    const metrics = greenMetrics();
    metrics.clickRate = metric(0.5, "red");
    const msg = formatReport({ ...base, metrics, cornerstoneUrl: "https://app.example.com" });
    expect(msg).toContain("📌 Dashboard: https://app.example.com/integrations/analytics");
  });
});
