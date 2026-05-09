import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";

describe("brainstorm signal tools", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("clamps query limits and escapes unsafe title search characters", async () => {
    const query = {
      data: [{ id: "sig-1", title: "OAuth risk" }],
      error: null,
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      ilike: vi.fn(),
      gte: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    query.ilike.mockReturnValue(query);
    query.gte.mockReturnValue(query);

    const supabase = {
      from: vi.fn(() => query),
    };

    const result = await brainstormQuerySignals(supabase as never, "ws-123", {
      q: "growth%, ai",
      limit: 999,
    });

    expect(supabase.from).toHaveBeenCalledWith("signals");
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(query.limit).toHaveBeenCalledWith(50);
    expect(query.ilike).toHaveBeenCalledWith("title", "%growth\\%  ai%");
    expect(result).toEqual({ signals: [{ id: "sig-1", title: "OAuth risk" }], count: 1 });
  });

  it("merges a proposed manual signal into the existing session artifact", async () => {
    const selectQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    selectQuery.select.mockReturnValue(selectQuery);
    selectQuery.eq.mockReturnValue(selectQuery);
    selectQuery.maybeSingle.mockResolvedValue({
      data: { artifact_json: { working_artifact: { thesis: "Keep this" } } },
      error: null,
    });

    const updateQuery = {
      update: vi.fn(),
      eq: vi.fn(),
      error: null,
    };
    updateQuery.update.mockReturnValue(updateQuery);
    updateQuery.eq.mockReturnValue(updateQuery);

    const supabase = {
      from: vi.fn().mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery),
    };

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "propose_manual_signal",
      {
        title: "  New source  ",
        url: "  https://example.com/signal  ",
        notes: "  Useful context  ",
      },
      { sessionId: "session-1" }
    );

    expect(updateQuery.update).toHaveBeenCalledWith({
      artifact_json: {
        working_artifact: { thesis: "Keep this" },
        pending_manual_signal: {
          title: "New source",
          url: "https://example.com/signal",
          notes: "Useful context",
        },
      },
      updated_at: expect.any(String),
    });
    expect(updateQuery.eq).toHaveBeenCalledWith("id", "session-1");
    expect(updateQuery.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(result).toMatchObject({
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: {
        title: "New source",
        url: "https://example.com/signal",
        notes: "Useful context",
      },
    });
  });

  it("saves working artifacts using accepted outline aliases and a deterministic timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-03T10:00:00.000Z"));

    const selectQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(),
    };
    selectQuery.select.mockReturnValue(selectQuery);
    selectQuery.eq.mockReturnValue(selectQuery);
    selectQuery.maybeSingle.mockResolvedValue({
      data: { artifact_json: { pending_manual_signal: { title: "Pending" } } },
      error: null,
    });

    const updateQuery = {
      update: vi.fn(),
      eq: vi.fn(),
      error: null,
    };
    updateQuery.update.mockReturnValue(updateQuery);
    updateQuery.eq.mockReturnValue(updateQuery);

    const supabase = {
      from: vi.fn().mockReturnValueOnce(selectQuery).mockReturnValueOnce(updateQuery),
    };

    const result = await executeBrainstormTool(
      supabase as never,
      "ws-123",
      "save_artifact_draft",
      {
        working_outline: "Outline from alias",
        key_claims: ["Claim"],
        cited_signal_ids: ["sig-1"],
        thesis: "Thesis",
      },
      { sessionId: "session-1" }
    );

    const workingArtifact = {
      working_outline: "Outline from alias",
      key_claims: ["Claim"],
      cited_signal_ids: ["sig-1"],
      thesis: "Thesis",
      saved_at: "2026-05-03T10:00:00.000Z",
    };
    expect(updateQuery.update).toHaveBeenCalledWith({
      artifact_json: {
        pending_manual_signal: { title: "Pending" },
        working_artifact: workingArtifact,
      },
      updated_at: "2026-05-03T10:00:00.000Z",
    });
    expect(result).toEqual({ ok: true, artifact: workingArtifact });
  });
});
