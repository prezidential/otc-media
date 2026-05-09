import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabase } from "../api/helpers";

const runCadenceIngestMock = vi.fn();

vi.mock("@/lib/research/runCadenceIngest", () => ({
  runCadenceIngest: (...args: unknown[]) => runCadenceIngestMock(...args),
}));

import {
  brainstormQuerySignals,
  executeBrainstormTool,
} from "@/lib/brainstorm/signal-tools";

const mockSupabase = createMockSupabase();

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase._chains.clear();
});

describe("brainstorm signal tools", () => {
  it("scopes signal search, clamps large limits, and escapes unsafe title search input", async () => {
    const chain = mockSupabase._setResult("signals", {
      data: [{ id: "sig-1", title: "OAuth", captured_at: "2026-04-27T00:00:00Z" }],
      error: null,
    });

    const result = await brainstormQuerySignals(mockSupabase, "ws-123", {
      q: "100%, OAuth",
      limit: 500,
      since_days: 7,
      directive_id: " directive-1 ",
    });

    expect(result).toEqual({
      signals: [{ id: "sig-1", title: "OAuth", captured_at: "2026-04-27T00:00:00Z" }],
      count: 1,
    });
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
    expect(chain.eq).toHaveBeenCalledWith("directive_id", "directive-1");
    expect(chain.limit).toHaveBeenCalledWith(50);
    expect(chain.gte).toHaveBeenCalledWith("captured_at", expect.any(String));
    expect(chain.ilike).toHaveBeenCalledWith("title", "%100\\%  OAuth%");
  });

  it("merges a proposed manual signal into the session artifact without dropping existing keys", async () => {
    const chain = mockSupabase._setResult("brainstorm_sessions", {
      data: {
        artifact_json: {
          working_artifact: { thesis: "Existing thesis" },
          other_state: { keep: true },
        },
      },
      error: null,
    });

    const result = await executeBrainstormTool(
      mockSupabase,
      "ws-123",
      "propose_manual_signal",
      {
        title: "  New regulatory clue  ",
        url: "  https://example.com/clue  ",
        notes: "  Important context  ",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({
      ok: true,
      awaiting_human_confirmation: true,
      pending_manual_signal: {
        title: "New regulatory clue",
        url: "https://example.com/clue",
        notes: "Important context",
      },
      hint: expect.stringContaining("Insert signal"),
    });
    expect(chain.update).toHaveBeenCalledWith({
      artifact_json: {
        working_artifact: { thesis: "Existing thesis" },
        other_state: { keep: true },
        pending_manual_signal: {
          title: "New regulatory clue",
          url: "https://example.com/clue",
          notes: "Important context",
        },
      },
      updated_at: expect.any(String),
    });
    expect(chain.eq).toHaveBeenCalledWith("id", "session-1");
    expect(chain.eq).toHaveBeenCalledWith("workspace_id", "ws-123");
  });

  it("saves a normalized working artifact for later promotion", async () => {
    const chain = mockSupabase._setResult("brainstorm_sessions", {
      data: {
        artifact_json: {
          pending_manual_signal: { title: "Keep me until confirmed" },
        },
      },
      error: null,
    });

    const result = await executeBrainstormTool(
      mockSupabase,
      "ws-123",
      "save_artifact_draft",
      {
        working_outline: "Outline from the model",
        key_claims: ["claim-a"],
        cited_signal_ids: ["sig-1", "sig-2"],
        thesis: "A defensible thesis",
      },
      { sessionId: "session-1" }
    );

    expect(result).toEqual({
      ok: true,
      artifact: {
        working_outline: "Outline from the model",
        key_claims: ["claim-a"],
        cited_signal_ids: ["sig-1", "sig-2"],
        thesis: "A defensible thesis",
        saved_at: expect.any(String),
      },
    });
    expect(chain.update).toHaveBeenCalledWith({
      artifact_json: {
        pending_manual_signal: { title: "Keep me until confirmed" },
        working_artifact: {
          working_outline: "Outline from the model",
          key_claims: ["claim-a"],
          cited_signal_ids: ["sig-1", "sig-2"],
          thesis: "A defensible thesis",
          saved_at: expect.any(String),
        },
      },
      updated_at: expect.any(String),
    });
  });

  it("rejects artifact-mutating tools when there is no active session context", async () => {
    await expect(
      executeBrainstormTool(mockSupabase, "ws-123", "propose_manual_signal", {
        title: "Manual signal",
      })
    ).rejects.toThrow("requires an active brainstorm session");

    await expect(
      executeBrainstormTool(mockSupabase, "ws-123", "save_artifact_draft", {
        outline: "Draft outline",
      })
    ).rejects.toThrow("requires an active brainstorm session");
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });
});
