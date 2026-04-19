import { supabaseAdmin } from "@/lib/supabase/server";

export type LaneBalanceReport = {
  laneId: string;
  laneName: string;
  slug: string;
  ring: "inner" | "middle" | "outer";
  targetPerMonth: number;
  actualLast30Days: number;
  deltaFromTarget: number;
  priority: number;
  overdue: boolean;
};

export type BalanceSummary = {
  lanes: LaneBalanceReport[];
  innerRingPercent: number;
  innerRingFloorMet: boolean;
  highestPriorityLane: LaneBalanceReport;
};

const DAY_MS = 86_400_000;

function emptySummary(): BalanceSummary {
  const placeholder: LaneBalanceReport = {
    laneId: "",
    laneName: "(no lanes)",
    slug: "",
    ring: "inner",
    targetPerMonth: 0,
    actualLast30Days: 0,
    deltaFromTarget: 0,
    priority: 0,
    overdue: false,
  };
  return {
    lanes: [],
    innerRingPercent: 0,
    innerRingFloorMet: true,
    highestPriorityLane: placeholder,
  };
}

/**
 * Pure helper for tests: build balance from lane definitions and draft rows (last 30d window assumed).
 */
export function buildBalanceSummary(
  lanes: Array<{
    id: string;
    name: string;
    slug: string;
    ring: string;
    target_frequency_per_month: number | null;
  }>,
  draftLaneIds: Array<string | null>
): BalanceSummary {
  if (lanes.length === 0) return emptySummary();

  const counts = new Map<string, number>();
  for (const lid of draftLaneIds) {
    if (!lid) continue;
    counts.set(lid, (counts.get(lid) ?? 0) + 1);
  }

  const reports: LaneBalanceReport[] = lanes.map((lane) => {
    const ring = (lane.ring === "inner" || lane.ring === "middle" || lane.ring === "outer" ? lane.ring : "outer") as
      | "inner"
      | "middle"
      | "outer";
    const targetPerMonth = typeof lane.target_frequency_per_month === "number" ? lane.target_frequency_per_month : 4;
    const actualLast30Days = counts.get(lane.id) ?? 0;
    const deltaFromTarget = actualLast30Days - targetPerMonth;
    const overdue = deltaFromTarget < 0;
    const priority = Math.min(100, Math.max(0, Math.round((targetPerMonth - actualLast30Days) * 12)));

    return {
      laneId: lane.id,
      laneName: lane.name,
      slug: lane.slug,
      ring,
      targetPerMonth,
      actualLast30Days,
      deltaFromTarget,
      priority,
      overdue,
    };
  });

  let innerRingDrafts = 0;
  let anyRingDrafts = 0;
  for (const lid of draftLaneIds) {
    if (!lid) continue;
    anyRingDrafts += 1;
    const lane = lanes.find((l) => l.id === lid);
    if (lane?.ring === "inner") innerRingDrafts += 1;
  }

  const innerRingPercent = anyRingDrafts === 0 ? 100 : Math.round((innerRingDrafts / anyRingDrafts) * 100);
  const innerRingFloorMet = anyRingDrafts === 0 ? true : innerRingPercent >= 50;

  const highestPriorityLane = [...reports].sort((a, b) => b.priority - a.priority)[0]!;

  return {
    lanes: reports,
    innerRingPercent,
    innerRingFloorMet,
    highestPriorityLane,
  };
}

export async function getLaneBalance(workspaceId: string): Promise<BalanceSummary> {
  const supabase = supabaseAdmin();
  const sinceIso = new Date(Date.now() - 30 * DAY_MS).toISOString();

  const { data: lanes, error: lanesErr } = await supabase
    .from("content_lanes")
    .select("id, name, slug, ring, target_frequency_per_month")
    .eq("workspace_id", workspaceId)
    .eq("is_active", true);

  if (lanesErr || !lanes?.length) {
    return emptySummary();
  }

  const { data: drafts, error: draftsErr } = await supabase
    .from("issue_drafts")
    .select("content_lane_id, created_at")
    .eq("workspace_id", workspaceId)
    .gte("created_at", sinceIso);

  if (draftsErr) {
    return buildBalanceSummary(lanes, []);
  }

  const draftLaneIds = (drafts ?? []).map((d) => (d.content_lane_id as string | null) ?? null);
  return buildBalanceSummary(lanes, draftLaneIds);
}

export async function enforceInnerRingFloor(workspaceId: string): Promise<boolean> {
  const summary = await getLaneBalance(workspaceId);
  return summary.innerRingFloorMet;
}

export type LeadRowWithLane = { id: string; content_lane_id?: string | null };

/**
 * When the inner-ring floor is not met, move inner-ring leads earlier so curation sees them first.
 */
export function sortApprovedLeadsForLaneContext<T extends LeadRowWithLane>(
  leads: T[],
  laneRingById: Map<string, "inner" | "middle" | "outer">,
  balance: BalanceSummary | undefined
): T[] {
  if (!balance || balance.innerRingFloorMet) return leads;

  const rank = (laneId: string | null | undefined) => {
    if (!laneId) return 4;
    const r = laneRingById.get(laneId);
    if (r === "inner") return 0;
    if (r === "middle") return 1;
    if (r === "outer") return 2;
    return 3;
  };

  return [...leads].sort((a, b) => {
    const primary = rank(a.content_lane_id) - rank(b.content_lane_id);
    if (primary !== 0) return primary;
    const boost = balance.highestPriorityLane?.laneId;
    if (!boost) return 0;
    const aHit = a.content_lane_id === boost ? 0 : 1;
    const bHit = b.content_lane_id === boost ? 0 : 1;
    return aHit - bHit;
  });
}
