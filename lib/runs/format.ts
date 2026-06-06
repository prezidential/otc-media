// Pure formatting helpers for the Pipeline Runs dashboard (§8 Phase 1 — pipeline status dashboard).
// Kept free of React/Supabase so they can be unit-tested in isolation, matching the repo's lib test style.

export type RunStatusTone = "success" | "danger" | "warning" | "muted";

export type RunRow = {
  run_type: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
  output_refs_json: unknown;
};

/**
 * Human-readable label for a run_type.
 *  - "agent:researcher"  -> "Researcher Agent"
 *  - "lead_generation"   -> "Lead Generation"
 *  - "directive_ingest"  -> "Directive Ingest"
 */
export function formatRunType(runType: string): string {
  if (!runType) return "Unknown";
  if (runType.startsWith("agent:")) {
    const id = runType.slice("agent:".length);
    return `${titleCase(id)} Agent`;
  }
  return titleCase(runType);
}

function titleCase(value: string): string {
  return value
    .split(/[_\-:\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Status badge metadata. `initiated`/`running`/`awaiting_human` are treated as in-flight (warning).
 */
export function runStatusMeta(status: string): { label: string; tone: RunStatusTone } {
  switch (status) {
    case "completed":
      return { label: "Completed", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "running":
      return { label: "Running", tone: "warning" };
    case "initiated":
      return { label: "Initiated", tone: "warning" };
    case "awaiting_human":
      return { label: "Awaiting Human", tone: "warning" };
    default:
      return { label: status ? titleCase(status) : "Unknown", tone: "muted" };
  }
}

/**
 * Elapsed time between start and finish, formatted compactly. Returns "—" when not computable.
 */
export function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return "—";
  const start = Date.parse(startedAt);
  const end = Date.parse(finishedAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return "—";
  const ms = end - start;
  if (ms < 0) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

/**
 * Relative "time ago" label. `now` is injectable for deterministic tests.
 */
export function formatRelativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return "—";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "—";
  const diff = now - then;
  if (diff < 0) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/**
 * Defensive extraction of the human-readable result from a run's output_refs_json.
 * Agent runs store { summary, decisions }; other run types may store arbitrary shapes.
 */
export function summarizeRun(outputRefs: unknown): { summary: string | null; decisions: string[] } {
  if (!outputRefs || typeof outputRefs !== "object") return { summary: null, decisions: [] };
  const obj = outputRefs as Record<string, unknown>;
  const summary = typeof obj.summary === "string" && obj.summary.trim() ? obj.summary.trim() : null;
  const decisions = Array.isArray(obj.decisions)
    ? obj.decisions.filter((d): d is string => typeof d === "string" && d.trim().length > 0)
    : [];
  return { summary, decisions };
}

/**
 * Aggregate counts for the dashboard header (total / completed / failed / in-flight).
 */
export function summarizeRuns(runs: RunRow[]): {
  total: number;
  completed: number;
  failed: number;
  inFlight: number;
  lastStartedAt: string | null;
} {
  let completed = 0;
  let failed = 0;
  let inFlight = 0;
  let lastStartedAt: string | null = null;
  for (const run of runs) {
    if (run.status === "completed") completed++;
    else if (run.status === "failed") failed++;
    else inFlight++;
    if (run.started_at && (!lastStartedAt || Date.parse(run.started_at) > Date.parse(lastStartedAt))) {
      lastStartedAt = run.started_at;
    }
  }
  return { total: runs.length, completed, failed, inFlight, lastStartedAt };
}
