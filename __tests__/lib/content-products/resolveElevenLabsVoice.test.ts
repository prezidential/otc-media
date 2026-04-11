import { describe, it, expect, vi } from "vitest";
import { resolveElevenLabsFromDraftBrand } from "@/lib/content-products/resolveElevenLabsVoice";
import { createMockSupabaseChain } from "@/__tests__/api/helpers";

function supabaseForDraftAndBrand(
  draftResult: { data: unknown; error: unknown },
  brandResult: { data: unknown; error: unknown }
) {
  const issueChain = createMockSupabaseChain(draftResult);
  const brandChain = createMockSupabaseChain(brandResult);
  return { from: vi.fn((t: string) => (t === "issue_drafts" ? issueChain : brandChain)) };
}

describe("resolveElevenLabsFromDraftBrand", () => {
  it("returns nulls when draft has no brand_profile_id", async () => {
    const supabase = supabaseForDraftAndBrand(
      { data: { brand_profile_id: null }, error: null },
      { data: {}, error: null }
    );
    const r = await resolveElevenLabsFromDraftBrand(supabase as never, "ws", "draft-1");
    expect(r).toEqual({ voiceId: null, modelId: null });
  });

  it("returns nulls on draft fetch error", async () => {
    const supabase = supabaseForDraftAndBrand({ data: null, error: { message: "x" } }, {
      data: {},
      error: null,
    });
    const r = await resolveElevenLabsFromDraftBrand(supabase as never, "ws", "draft-1");
    expect(r).toEqual({ voiceId: null, modelId: null });
  });

  it("loads voice and model from brand profile", async () => {
    const supabase = supabaseForDraftAndBrand(
      { data: { brand_profile_id: "bp-1" }, error: null },
      {
        data: {
          elevenlabs_voice_id: " voice-99 ",
          elevenlabs_model_id: " eleven_turbo_v2_5 ",
        },
        error: null,
      }
    );
    const r = await resolveElevenLabsFromDraftBrand(supabase as never, "ws", "draft-1");
    expect(r).toEqual({ voiceId: "voice-99", modelId: "eleven_turbo_v2_5" });
  });

  it("treats blank strings as null", async () => {
    const supabase = supabaseForDraftAndBrand(
      { data: { brand_profile_id: "bp-1" }, error: null },
      { data: { elevenlabs_voice_id: "   ", elevenlabs_model_id: "" }, error: null }
    );
    const r = await resolveElevenLabsFromDraftBrand(supabase as never, "ws", "draft-1");
    expect(r).toEqual({ voiceId: null, modelId: null });
  });
});
