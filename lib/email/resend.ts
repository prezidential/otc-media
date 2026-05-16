import { Resend } from "resend";

type Role = "owner" | "editor" | "viewer";

export type SendInviteResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildSubject(workspaceName: string): string {
  return `You're invited to ${workspaceName} on Cornerstone OS`;
}

function buildTextBody(opts: {
  inviteUrl: string;
  workspaceName: string;
  inviterEmail: string | null;
  role: Role;
}): string {
  const inviterLine = opts.inviterEmail
    ? `${opts.inviterEmail} has invited you to join the ${opts.workspaceName} workspace on Cornerstone OS as a ${opts.role}.`
    : `You have been invited to join the ${opts.workspaceName} workspace on Cornerstone OS as a ${opts.role}.`;
  return [
    "Hi there,",
    "",
    inviterLine,
    "",
    `Accept the invite: ${opts.inviteUrl}`,
    "",
    "This link expires in 14 days.",
    "",
    "— Cornerstone OS",
  ].join("\n");
}

function buildHtmlBody(opts: {
  inviteUrl: string;
  workspaceName: string;
  inviterEmail: string | null;
  role: Role;
}): string {
  const safeWorkspace = escapeHtml(opts.workspaceName);
  const safeInviter = opts.inviterEmail ? escapeHtml(opts.inviterEmail) : null;
  const safeRole = escapeHtml(opts.role);
  const safeUrl = escapeHtml(opts.inviteUrl);
  const inviterLine = safeInviter
    ? `<strong>${safeInviter}</strong> has invited you to join the <strong>${safeWorkspace}</strong> workspace on Cornerstone OS as <strong>${safeRole}</strong>.`
    : `You have been invited to join the <strong>${safeWorkspace}</strong> workspace on Cornerstone OS as <strong>${safeRole}</strong>.`;
  return `<!doctype html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5; color: #111; max-width: 560px; margin: 0 auto; padding: 24px;">
    <p>Hi there,</p>
    <p>${inviterLine}</p>
    <p>
      <a href="${safeUrl}" style="display: inline-block; padding: 10px 16px; background: #111; color: #fff; text-decoration: none; border-radius: 6px;">Accept invite</a>
    </p>
    <p style="font-size: 13px; color: #555;">
      Or paste this URL into your browser:<br />
      <a href="${safeUrl}">${safeUrl}</a>
    </p>
    <p style="font-size: 13px; color: #555;">This link expires in 14 days.</p>
    <p style="font-size: 13px; color: #555;">— Cornerstone OS</p>
  </body>
</html>`;
}

/**
 * Send a workspace invite email via Resend.
 *
 * Reads RESEND_API_KEY and EMAIL_FROM from process.env at call time so missing
 * configuration returns a clean error rather than crashing on import. Network
 * and SDK failures are caught and returned as `{ ok: false, error }`; this
 * function never throws.
 */
export async function sendWorkspaceInvite(opts: {
  to: string;
  inviteUrl: string;
  workspaceName: string;
  inviterEmail: string | null;
  role: Role;
}): Promise<SendInviteResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { ok: false, error: "Email not configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: opts.to,
      subject: buildSubject(opts.workspaceName),
      text: buildTextBody(opts),
      html: buildHtmlBody(opts),
    });
    if (error) {
      return { ok: false, error: error.message };
    }
    if (!data) {
      return { ok: false, error: "Resend returned no message id" };
    }
    return { ok: true, messageId: data.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}
