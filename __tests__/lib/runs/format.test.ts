import { describe, it, expect } from "vitest";
import {
  formatRunType,
  runStatusMeta,
  formatDuration,
  formatRelativeTime,
  summarizeRun,
  summarizeRuns,
  type RunRow,
} from "@/lib/runs/format";

describe("formatRunType", () => {
  it("formats agent run types as '<Name> Agent'", () => {
    expect(formatRunType("agent:researcher")).toBe("Researcher Agent");
    expect(formatRunType("agent:editor")).toBe("Editor Agent");
  });

  it("title-cases snake_case run types", () => {
    expect(formatRunType("lead_generation")).toBe("Lead Generation");
    expect(formatRunType("directive_ingest")).toBe("Directive Ingest");
  });

  it("handles empty input", () => {
    expect(formatRunType("")).toBe("Unknown");
  });
});

describe("runStatusMeta", () => {
  it("maps known statuses to label + tone", () => {
    expect(runStatusMeta("completed")).toEqual({ label: "Completed", tone: "success" });
    expect(runStatusMeta("failed")).toEqual({ label: "Failed", tone: "danger" });
    expect(runStatusMeta("initiated")).toEqual({ label: "Initiated", tone: "warning" });
    expect(runStatusMeta("awaiting_human")).toEqual({ label: "Awaiting Human", tone: "warning" });
  });

  it("falls back to muted tone for unknown status", () => {
    expect(runStatusMeta("weird_state")).toEqual({ label: "Weird State", tone: "muted" });
  });
});

describe("formatDuration", () => {
  it("returns em dash when timestamps are missing", () => {
    expect(formatDuration(null, null)).toBe("—");
    expect(formatDuration("2026-06-06T00:00:00Z", null)).toBe("—");
  });

  it("formats sub-second, second, and minute durations", () => {
    expect(formatDuration("2026-06-06T00:00:00.000Z", "2026-06-06T00:00:00.500Z")).toBe("500ms");
    expect(formatDuration("2026-06-06T00:00:00.000Z", "2026-06-06T00:00:01.500Z")).toBe("1.5s");
    expect(formatDuration("2026-06-06T00:00:00.000Z", "2026-06-06T00:01:30.000Z")).toBe("1m 30s");
  });

  it("returns em dash for negative or invalid ranges", () => {
    expect(formatDuration("2026-06-06T00:01:00Z", "2026-06-06T00:00:00Z")).toBe("—");
    expect(formatDuration("not-a-date", "also-not")).toBe("—");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.parse("2026-06-06T12:00:00Z");

  it("formats recent and older timestamps", () => {
    expect(formatRelativeTime("2026-06-06T11:59:30Z", now)).toBe("just now");
    expect(formatRelativeTime("2026-06-06T11:30:00Z", now)).toBe("30m ago");
    expect(formatRelativeTime("2026-06-06T09:00:00Z", now)).toBe("3h ago");
    expect(formatRelativeTime("2026-06-04T12:00:00Z", now)).toBe("2d ago");
  });

  it("handles null and invalid input", () => {
    expect(formatRelativeTime(null, now)).toBe("—");
    expect(formatRelativeTime("nonsense", now)).toBe("—");
  });
});

describe("summarizeRun", () => {
  it("extracts summary and decisions from agent output", () => {
    const result = summarizeRun({ summary: "Ingested 4 directives", decisions: ["ran daily", "skipped weekly"] });
    expect(result.summary).toBe("Ingested 4 directives");
    expect(result.decisions).toEqual(["ran daily", "skipped weekly"]);
  });

  it("is defensive against missing or malformed shapes", () => {
    expect(summarizeRun(null)).toEqual({ summary: null, decisions: [] });
    expect(summarizeRun("string")).toEqual({ summary: null, decisions: [] });
    expect(summarizeRun({ summary: "  ", decisions: [1, "ok", null] })).toEqual({
      summary: null,
      decisions: ["ok"],
    });
  });
});

describe("summarizeRuns", () => {
  it("aggregates counts and finds the most recent start", () => {
    const runs: RunRow[] = [
      { run_type: "agent:researcher", status: "completed", started_at: "2026-06-06T10:00:00Z", finished_at: "2026-06-06T10:00:05Z", error_message: null, output_refs_json: null },
      { run_type: "agent:writer", status: "failed", started_at: "2026-06-06T11:00:00Z", finished_at: null, error_message: "boom", output_refs_json: null },
      { run_type: "lead_generation", status: "running", started_at: "2026-06-06T09:00:00Z", finished_at: null, error_message: null, output_refs_json: null },
    ];
    expect(summarizeRuns(runs)).toEqual({
      total: 3,
      completed: 1,
      failed: 1,
      inFlight: 1,
      lastStartedAt: "2026-06-06T11:00:00Z",
    });
  });

  it("handles an empty list", () => {
    expect(summarizeRuns([])).toEqual({ total: 0, completed: 0, failed: 0, inFlight: 0, lastStartedAt: null });
  });
});
