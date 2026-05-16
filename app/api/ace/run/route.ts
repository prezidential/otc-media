import { NextResponse } from "next/server";
import { runAce } from "@/lib/ace/orchestrator";
import { requireWorkspace } from "@/lib/auth/session";

/**
 * POST /api/ace/run
 *
 * Two call patterns:
 *
 *   1. User-initiated (browser, e.g. the "Run ACE now" button on `/ace`).
 *      Authenticated via Supabase session; workspace resolved from
 *      `requireWorkspace()`. Body: `{ forceRerun?: boolean }`.
 *
 *   2. Internal (called by `app/api/ace/cron/route.ts`). No user session;
 *      caller must present `Authorization: Bearer ${CRON_SECRET}` and pass
 *      `{ workspaceId, forceRerun? }` in the body. Bypasses the session check
 *      entirely. The orchestrator runs under `supabaseAdmin()` regardless of
 *      caller, so admin-context callers don't need to spoof a session.
 *
 * The internal path exists so the cron entrypoint (which iterates every
 * workspace with `ace_enabled = true`) can fan out to a single, idempotent
 * runAce(...) implementation without duplicating its body. M2 removed
 * `process.env.WORKSPACE_ID`; without an internal-token path, there's no way
 * for a system-only caller to specify which workspace to run.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: unknown;
    forceRerun?: unknown;
  };
  const forceRerun = Boolean(body.forceRerun);

  const auth = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isInternalCall =
    typeof auth === "string" &&
    auth.length > 0 &&
    typeof cronSecret === "string" &&
    cronSecret.length > 0 &&
    auth === `Bearer ${cronSecret}`;

  let workspaceId: string;

  if (isInternalCall) {
    const wsId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!wsId) {
      return NextResponse.json(
        { ok: false, error: "workspaceId is required for internal callers" },
        { status: 400 }
      );
    }
    workspaceId = wsId;
  } else {
    const ctx = await requireWorkspace();
    if (ctx instanceof Response) return ctx;
    workspaceId = ctx.workspaceId;
  }

  const result = await runAce({
    workspaceId,
    trigger: isInternalCall ? "cron" : "manual",
    forceRerun,
  });

  return NextResponse.json(result);
}
