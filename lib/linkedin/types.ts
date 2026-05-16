/**
 * TypeScript types for the LinkedIn integration tables defined in
 * `lib/supabase/schema-linkedin.sql`.
 *
 * Column names and nullability mirror the SQL exactly. Keep this file in sync
 * when the schema changes.
 */

/**
 * One row in the `linkedin_connections_decrypted` view — i.e. the shape
 * application code consumes after M2 encryption-at-rest.
 *
 * The underlying `linkedin_connections` table stores `access_token` and
 * `refresh_token` as pgsodium AEAD-DET `bytea` ciphertext. App code never
 * touches the raw table; reads go through the `_decrypted` view (which calls
 * `public.linkedin_decrypt`) and writes go through
 * `public.upsert_linkedin_connection` (which calls `public.linkedin_encrypt`).
 * Both are wired in `lib/linkedin/store.ts`.
 */
export type LinkedInConnectionRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  /** LinkedIn `sub` (stable per LinkedIn account). */
  provider_user_id: string;
  /** Plaintext: decrypted server-side by the `_decrypted` view. */
  access_token: string;
  /** Plaintext, or null when `offline_access` scope wasn't granted. */
  refresh_token: string | null;
  /** ISO timestamp string. */
  expires_at: string;
  scope: string;
  /** Snapshot from `/v2/userinfo` at connect time. */
  profile_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** Status lifecycle for `linkedin_drafts.status`. */
export type LinkedInDraftStatus = "draft" | "reviewed" | "published" | "dismissed";

/** One row in `linkedin_drafts`. */
export type LinkedInDraftRow = {
  id: string;
  workspace_id: string;
  brand_profile_id: string | null;
  source_lead_id: string | null;
  source_issue_draft_id: string | null;
  content_json: LinkedInDraftObject;
  status: LinkedInDraftStatus;
  posted_at: string | null;
  /** LinkedIn UGC post URN once published. */
  posted_provider_id: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Placeholder shape for a LinkedIn post draft. The Phase 3 "LinkedIn Draft
 * Engine" will fill this out with concrete sections (hook, body, hashtags, CTA,
 * attachments, etc.). For M1 we accept any structured JSON body.
 */
export type LinkedInDraftObject = {
  /** Plain-text body the author will paste into LinkedIn until we wire posting. */
  body?: string;
  /** Optional working title used by editorial UIs. */
  working_title?: string;
  /** Free-form metadata stored alongside the draft. */
  meta?: Record<string, unknown>;
  /** Future fields (sections, attachments, hashtags) live here. */
  [key: string]: unknown;
};

/** Successful token-exchange result from LinkedIn `/oauth/v2/accessToken`. */
export type LinkedInTokenResult = {
  accessToken: string;
  refreshToken: string | null;
  /** Seconds until `accessToken` expires (per LinkedIn's response). */
  expiresIn: number;
  scope: string;
};

/** Subset of `/v2/userinfo` we persist on connect. */
export type LinkedInProfileResult = {
  providerUserId: string;
  profileJson: Record<string, unknown>;
};
