import { describe, it, expect } from "vitest";
import {
  serializeBrandProfileForApi,
  validateCreatorBrandProfilePayload,
  type CreatorBrandProfileRow,
} from "@/lib/brand-profile/creatorBrandProfile";

const validMinimal = {
  name: "Test Brand",
  voice_rules_json: {},
  formatting_rules_json: {},
  forbidden_patterns_json: [],
  cta_rules_json: {},
  emoji_policy_json: {},
  narrative_preferences_json: {},
};

describe("validateCreatorBrandProfilePayload", () => {
  it("accepts a minimal valid payload", () => {
    const r = validateCreatorBrandProfilePayload(validMinimal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Test Brand");
      expect(r.value.elevenlabs_voice_id).toBeNull();
      expect(r.value.elevenlabs_model_id).toBeNull();
      expect(r.value.profile_version).toBeNull();
    }
  });

  it("trims name and optional strings", () => {
    const r = validateCreatorBrandProfilePayload({
      ...validMinimal,
      name: "  Acme  ",
      profile_version: " 2.0 ",
      elevenlabs_voice_id: " vid ",
      elevenlabs_model_id: " m1 ",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("Acme");
      expect(r.value.profile_version).toBe("2.0");
      expect(r.value.elevenlabs_voice_id).toBe("vid");
      expect(r.value.elevenlabs_model_id).toBe("m1");
    }
  });

  it("rejects non-object body", () => {
    expect(validateCreatorBrandProfilePayload(null).ok).toBe(false);
    expect(validateCreatorBrandProfilePayload("x").ok).toBe(false);
  });

  it("rejects empty name", () => {
    const r = validateCreatorBrandProfilePayload({ ...validMinimal, name: "   " });
    expect(r.ok).toBe(false);
  });

  it("requires object-shaped JSON fields", () => {
    const r = validateCreatorBrandProfilePayload({ ...validMinimal, voice_rules_json: [] });
    expect(r.ok).toBe(false);
  });

  it("requires forbidden_patterns_json as array", () => {
    const r = validateCreatorBrandProfilePayload({ ...validMinimal, forbidden_patterns_json: {} });
    expect(r.ok).toBe(false);
  });

  it("rejects invalid profile_version type", () => {
    const r = validateCreatorBrandProfilePayload({ ...validMinimal, profile_version: 1 });
    expect(r.ok).toBe(false);
  });
});

describe("serializeBrandProfileForApi", () => {
  it("passes through row fields", () => {
    const row: CreatorBrandProfileRow = {
      id: "id-1",
      workspace_id: "ws",
      name: "N",
      voice_rules_json: { a: 1 },
      formatting_rules_json: {},
      forbidden_patterns_json: ["x"],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
      profile_version: "1.0",
      elevenlabs_voice_id: "v",
      elevenlabs_model_id: "m",
      created_at: "2020-01-01",
    };
    expect(serializeBrandProfileForApi(row)).toEqual({
      id: "id-1",
      workspace_id: "ws",
      name: "N",
      voice_rules_json: { a: 1 },
      formatting_rules_json: {},
      forbidden_patterns_json: ["x"],
      cta_rules_json: {},
      emoji_policy_json: {},
      narrative_preferences_json: {},
      profile_version: "1.0",
      elevenlabs_voice_id: "v",
      elevenlabs_model_id: "m",
      created_at: "2020-01-01",
    });
  });
});
