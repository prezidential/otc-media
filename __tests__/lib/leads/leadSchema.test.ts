import { describe, it, expect } from "vitest";
import { LeadItemSchema, LeadsOutputSchema } from "@/lib/leads/leadSchema";

// ─── LeadItemSchema ──────────────────────────────────────────────

describe("LeadItemSchema", () => {
  const validLead = {
    angle: "Supply chain attacks expose identity governance gaps",
    why_now: "Recent Cline CLI incident shows trusted tools can be compromised",
    who_it_impacts: "DevSecOps teams",
    contrarian_take: "We secure accounts but ignore the tools that inherit their permissions",
    confidence: 0.7,
    sources: ["https://example.com/article1"],
  };

  it("accepts a valid lead item", () => {
    const result = LeadItemSchema.safeParse(validLead);
    expect(result.success).toBe(true);
  });

  it("rejects angle shorter than 10 chars", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, angle: "Too short" });
    expect(result.success).toBe(false);
  });

  it("rejects why_now shorter than 10 chars", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, why_now: "Short" });
    expect(result.success).toBe(false);
  });

  it("rejects who_it_impacts shorter than 5 chars", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, who_it_impacts: "Hi" });
    expect(result.success).toBe(false);
  });

  it("rejects contrarian_take shorter than 10 chars", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, contrarian_take: "Nope" });
    expect(result.success).toBe(false);
  });

  it("rejects confidence below 0", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, confidence: -0.1 });
    expect(result.success).toBe(false);
  });

  it("rejects confidence above 1", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, confidence: 1.1 });
    expect(result.success).toBe(false);
  });

  it("accepts confidence at boundaries (0 and 1)", () => {
    expect(LeadItemSchema.safeParse({ ...validLead, confidence: 0 }).success).toBe(true);
    expect(LeadItemSchema.safeParse({ ...validLead, confidence: 1 }).success).toBe(true);
  });

  it("rejects empty sources array", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, sources: [] });
    expect(result.success).toBe(false);
  });

  it("rejects non-URL strings in sources", () => {
    const result = LeadItemSchema.safeParse({ ...validLead, sources: ["not-a-url"] });
    expect(result.success).toBe(false);
  });

  it("accepts multiple valid URLs in sources", () => {
    const result = LeadItemSchema.safeParse({
      ...validLead,
      sources: ["https://example.com/a", "https://example.com/b"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(LeadItemSchema.safeParse({}).success).toBe(false);
    expect(LeadItemSchema.safeParse({ angle: "test" }).success).toBe(false);
  });
});

// ─── LeadsOutputSchema ───────────────────────────────────────────

describe("LeadsOutputSchema", () => {
  const validLead = {
    angle: "Supply chain attacks expose identity governance gaps",
    why_now: "Recent Cline CLI incident shows trusted tools can be compromised",
    who_it_impacts: "DevSecOps teams",
    contrarian_take: "We secure accounts but ignore the tools that inherit their permissions",
    confidence: 0.7,
    sources: ["https://example.com/article1"],
  };

  it("accepts valid output with directive and leads", () => {
    const result = LeadsOutputSchema.safeParse({
      directive: "Identity + AI",
      leads: [validLead],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty leads array", () => {
    const result = LeadsOutputSchema.safeParse({ directive: "Test", leads: [] });
    expect(result.success).toBe(false);
  });

  it("rejects more than 6 leads", () => {
    const leads = Array(7).fill(validLead);
    const result = LeadsOutputSchema.safeParse({ directive: "Test", leads });
    expect(result.success).toBe(false);
  });

  it("accepts up to 6 leads", () => {
    const leads = Array(6).fill(validLead);
    const result = LeadsOutputSchema.safeParse({ directive: "Test", leads });
    expect(result.success).toBe(true);
  });

  it("rejects missing directive", () => {
    const result = LeadsOutputSchema.safeParse({ leads: [validLead] });
    expect(result.success).toBe(false);
  });

  it("rejects if any lead is invalid", () => {
    const result = LeadsOutputSchema.safeParse({
      directive: "Test",
      leads: [validLead, { ...validLead, confidence: 5 }],
    });
    expect(result.success).toBe(false);
  });
});
