import { describe, it, expect, beforeEach, vi } from "vitest";
import { encryptToken, decryptToken } from "@/lib/integrations/beehiiv/crypto";

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("BEEHIIV_TOKEN_ENC_KEY", "test-secret-key");
});

describe("beehiiv token crypto", () => {
  it("round-trips a token", () => {
    const token = "beehiiv_access_token_abc123";
    const enc = encryptToken(token);
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain(token);
    expect(decryptToken(enc)).toBe(token);
  });

  it("produces a different ciphertext each time (random IV) but decrypts the same", () => {
    const a = encryptToken("x");
    const b = encryptToken("x");
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe("x");
    expect(decryptToken(b)).toBe("x");
  });

  it("rejects malformed ciphertext", () => {
    expect(() => decryptToken("not-valid")).toThrow(/format/);
  });

  it("throws when the key env is missing", () => {
    vi.stubEnv("BEEHIIV_TOKEN_ENC_KEY", "");
    expect(() => encryptToken("x")).toThrow(/BEEHIIV_TOKEN_ENC_KEY/);
  });
});
