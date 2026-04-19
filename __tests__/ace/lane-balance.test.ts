import { describe, it, expect } from "vitest";
import { buildBalanceSummary, sortApprovedLeadsForLaneContext } from "@/lib/ace/lane-balance";

const sampleLanes = [
  { id: "inner-1", name: "IAM Core", slug: "iam-core", ring: "inner", target_frequency_per_month: 8 },
  { id: "mid-1", name: "AI × Identity", slug: "ai-identity", ring: "middle", target_frequency_per_month: 4 },
  { id: "out-1", name: "B2B Creator", slug: "b2b-creator", ring: "outer", target_frequency_per_month: 2 },
];

describe("buildBalanceSummary", () => {
  it("treats empty lane list as floor met with empty lanes", () => {
    const s = buildBalanceSummary([], ["inner-1"]);
    expect(s.lanes).toHaveLength(0);
    expect(s.innerRingFloorMet).toBe(true);
  });

  it("marks inner ring floor not met when tagged drafts are mostly non-inner", () => {
    const s = buildBalanceSummary(sampleLanes, ["mid-1", "mid-1", "mid-1"]);
    expect(s.innerRingPercent).toBe(0);
    expect(s.innerRingFloorMet).toBe(false);
  });

  it("marks inner ring floor met when at least half of tagged drafts are inner", () => {
    const s = buildBalanceSummary(sampleLanes, ["inner-1", "mid-1"]);
    expect(s.innerRingPercent).toBe(50);
    expect(s.innerRingFloorMet).toBe(true);
  });

  it("ranks highest priority as the lane most under its monthly target", () => {
    const s = buildBalanceSummary(sampleLanes, []);
    expect(s.highestPriorityLane.slug).toBe("iam-core");
  });
});

describe("sortApprovedLeadsForLaneContext", () => {
  const ringMap = new Map<string, "inner" | "middle" | "outer">([
    ["inner-1", "inner"],
    ["mid-1", "middle"],
  ]);

  it("does not reorder when floor is met", () => {
    const balance = buildBalanceSummary(sampleLanes, ["inner-1", "inner-1"]);
    const leads = [{ id: "1", content_lane_id: "mid-1" as string | null }];
    const out = sortApprovedLeadsForLaneContext(leads, ringMap, balance);
    expect(out.map((l) => l.id)).toEqual(["1"]);
  });

  it("moves inner-ring leads first when floor not met", () => {
    const balance = buildBalanceSummary(sampleLanes, ["mid-1", "mid-1", "mid-1"]);
    const leads = [
      { id: "a", content_lane_id: "mid-1" },
      { id: "b", content_lane_id: "inner-1" },
    ];
    const out = sortApprovedLeadsForLaneContext(leads, ringMap, balance);
    expect(out[0]?.id).toBe("b");
    expect(out[1]?.id).toBe("a");
  });
});
