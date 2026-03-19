import { describe, it, expect, vi, beforeEach } from "vitest";
import { getModelForRole } from "@/lib/llm/provider";
import type { AgentRole } from "@/lib/llm/provider";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("getModelForRole", () => {
  it("returns anthropic defaults when no env vars set", () => {
    const config = getModelForRole("drafting");
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-sonnet-4-20250514");
  });

  it("uses global LLM_PROVIDER override", () => {
    vi.stubEnv("LLM_PROVIDER", "openai");
    const config = getModelForRole("leads");
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
  });

  it("uses global LLM_MODEL override", () => {
    vi.stubEnv("LLM_MODEL", "claude-haiku-20250514");
    const config = getModelForRole("lint");
    expect(config.provider).toBe("anthropic");
    expect(config.model).toBe("claude-haiku-20250514");
  });

  it("uses per-role override over global", () => {
    vi.stubEnv("LLM_PROVIDER", "anthropic");
    vi.stubEnv("LLM_EDITOR", "openai:gpt-4o-mini");
    const config = getModelForRole("editor");
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("falls back to global when role env is invalid", () => {
    vi.stubEnv("LLM_LEADS", "invalid:model");
    const config = getModelForRole("leads");
    expect(config.provider).toBe("anthropic");
  });

  it("supports all defined agent roles", () => {
    const roles: AgentRole[] = ["research", "leads", "editor", "drafting", "revision", "lint", "linkedin"];
    for (const role of roles) {
      const config = getModelForRole(role);
      expect(config.provider).toBeDefined();
      expect(config.model).toBeDefined();
    }
  });

  it("per-role override with provider only uses default model", () => {
    vi.stubEnv("LLM_LINT", "openai:");
    const config = getModelForRole("lint");
    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o");
  });
});
