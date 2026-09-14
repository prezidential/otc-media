import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LINKEDIN_OAUTH_SCOPES,
  LINKEDIN_STATE_COOKIE,
  getAuthorizationUrl,
  getLinkedInConfig,
} from "@/lib/linkedin/oauth";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LinkedIn publishing OAuth helpers", () => {
  it("returns null when any required env var is missing", () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "id");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret");
    vi.stubEnv("LINKEDIN_REDIRECT_URI", "");
    expect(getLinkedInConfig()).toBeNull();
  });

  it("returns config when all three env vars are set", () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "id");
    vi.stubEnv("LINKEDIN_CLIENT_SECRET", "secret");
    vi.stubEnv("LINKEDIN_REDIRECT_URI", "http://localhost:3000/api/auth/linkedin/callback");
    expect(getLinkedInConfig()).toEqual({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "http://localhost:3000/api/auth/linkedin/callback",
    });
  });

  it("builds the authorize URL with documented scopes and does not encode workspaceId", () => {
    vi.stubEnv("LINKEDIN_CLIENT_ID", "client-abc");
    const url = new URL(
      getAuthorizationUrl({
        workspaceId: "ws-should-not-appear",
        state: "state-xyz",
        redirectUri: "http://localhost:3000/api/auth/linkedin/callback",
      })
    );
    expect(url.origin + url.pathname).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "http://localhost:3000/api/auth/linkedin/callback"
    );
    expect(url.searchParams.get("state")).toBe("state-xyz");
    expect(url.searchParams.get("scope")).toBe("openid profile email w_member_social");
    expect(url.search).not.toContain("ws-should-not-appear");
    expect(url.search).not.toContain("workspace");
  });

  it("exports the state cookie name and scope list used by the start route", () => {
    expect(LINKEDIN_STATE_COOKIE).toBe("linkedin_oauth_state");
    expect([...LINKEDIN_OAUTH_SCOPES]).toEqual([
      "openid",
      "profile",
      "email",
      "w_member_social",
    ]);
  });
});
