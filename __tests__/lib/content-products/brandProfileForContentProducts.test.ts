import { describe, expect, it } from "vitest";
import {
  brandProfilePromptPayload,
  formatBrandProfileBlockForSocialPrompt,
  resolveBrandProfileIdForSocial,
} from "@/lib/content-products/brandProfileForContentProducts";

describe("resolveBrandProfileIdForSocial", () => {
  it("prefers draft id over body", () => {
    expect(
      resolveBrandProfileIdForSocial({
        draftBrandProfileId: "draft-bp",
        bodyBrandProfileId: "body-bp",
      })
    ).toBe("draft-bp");
  });

  it("uses body when draft is null", () => {
    expect(
      resolveBrandProfileIdForSocial({
        draftBrandProfileId: null,
        bodyBrandProfileId: "body-bp",
      })
    ).toBe("body-bp");
  });

  it("returns null when neither set", () => {
    expect(
      resolveBrandProfileIdForSocial({
        draftBrandProfileId: null,
        bodyBrandProfileId: undefined,
      })
    ).toBeNull();
  });
});

describe("brandProfilePromptPayload", () => {
  it("includes name and JSON rule fields", () => {
    const p = brandProfilePromptPayload({
      id: "1",
      name: "Test Brand",
      voice_rules_json: { tone: "sharp" },
      formatting_rules_json: {},
      forbidden_patterns_json: [],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
    });
    expect(p.name).toBe("Test Brand");
    expect(p.voice_rules_json).toEqual({ tone: "sharp" });
    expect(p).not.toHaveProperty("id");
  });
});

describe("formatBrandProfileBlockForSocialPrompt", () => {
  it("embeds JSON in a labeled block", () => {
    const block = formatBrandProfileBlockForSocialPrompt({
      id: "1",
      name: "NB",
      voice_rules_json: { a: 1 },
      formatting_rules_json: null,
      forbidden_patterns_json: null,
      cta_rules_json: null,
      emoji_policy_json: null,
      narrative_preferences_json: null,
    });
    expect(block).toContain("### Brand profile");
    expect(block).toContain('"name": "NB"');
    expect(block).toContain('"a": 1');
  });
});
