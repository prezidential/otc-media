export type DashboardNeedsYou = "research" | "leads" | "issues" | "outlines" | null;

export type DashboardStatsPayload = {
  pipeline: {
    research: { count: number; sublabel: string };
    leads: { count: number; sublabel: string };
    issues: { count: number; sublabel: string };
    outlines: { count: number; sublabel: string };
  };
  needsYou: DashboardNeedsYou;
  sidebar: {
    signalsIngestedLine: string;
    leadsLine: string;
    issuesLine: string;
    /** Numeric mirrors for nav badges (Studio shell). */
    signalsIngested24h: number;
    leadsToApprove: number;
    issuesDrafting: number;
  };
  greeting: {
    dateLine: string;
    headline: string;
    accentPhrase: string;
  };
  nudge: {
    line1: string;
    accentFragment: string;
    lineAfterAccent: string;
    primaryCta: { label: string; href: string };
    secondaryLabel: string;
  };
  lastIngest: {
    at: string | null;
    inserted: number | null;
    isStale: boolean;
  };
};

const STALE_MS = 3 * 24 * 60 * 60 * 1000;

export function formatDayStamp(d: Date): string {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).toUpperCase();
}

export function greetingParts(): { dateLine: string; headline: string; accentPhrase: string } {
  const h = new Date().getHours();
  const part = h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
  return {
    dateLine: formatDayStamp(new Date()),
    headline: `${part} Here's your desk.`,
    accentPhrase: "Ideas are stacking.",
  };
}

export function pickNeedsYou(p: {
  leadsPending: number;
  issuesDraft: number;
  staleResearch: boolean;
  outlinesCount: number;
}): DashboardNeedsYou {
  if (p.leadsPending > 0) return "leads";
  if (p.issuesDraft > 0) return "issues";
  if (p.staleResearch) return "research";
  if (p.outlinesCount > 0) return "outlines";
  return null;
}

export function buildNudge(params: {
  leadsPending: number;
  oldestPendingLeadDays: number | null;
  issuesDraft: number;
  staleResearch: boolean;
}): DashboardStatsPayload["nudge"] {
  if (params.leadsPending > 0) {
    const days = params.oldestPendingLeadDays ?? 1;
    return {
      line1: "",
      accentFragment: `${params.leadsPending} lead${params.leadsPending === 1 ? "" : "s"}`,
      lineAfterAccent: ` ${days === 1 ? "has" : "have"} been waiting ${days} day${days === 1 ? "" : "s"}. Approve them to keep the issue on pace.`,
      primaryCta: { label: "Review leads →", href: "/leads" },
      secondaryLabel: "Snooze",
    };
  }
  if (params.issuesDraft > 0) {
    return {
      line1: "",
      accentFragment: `${params.issuesDraft} draft issue${params.issuesDraft === 1 ? "" : "s"}`,
      lineAfterAccent: " need a pass before publish.",
      primaryCta: { label: "Open Issues →", href: "/issues" },
      secondaryLabel: "Snooze",
    };
  }
  if (params.staleResearch) {
    return {
      line1: "Signal ingest is ",
      accentFragment: "stale",
      lineAfterAccent: ". Run Research directives to refresh the inbox.",
      primaryCta: { label: "Go to Research →", href: "/research" },
      secondaryLabel: "Snooze",
    };
  }
  return {
    line1: "You're ",
    accentFragment: "caught up",
    lineAfterAccent: " on approvals. Generate leads or draft the next issue when you're ready.",
    primaryCta: { label: "Research console →", href: "/research" },
    secondaryLabel: "Snooze",
  };
}

export function lastIngestStale(finishedAt: string | null, startedAt: string | null): boolean {
  const t = finishedAt ?? startedAt;
  if (!t) return true;
  return Date.now() - new Date(t).getTime() > STALE_MS;
}
