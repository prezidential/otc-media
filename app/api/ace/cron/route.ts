import { NextResponse } from "next/server";
import { runAce } from "@/lib/ace/orchestrator";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.ACE_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: true, result: { status: "skipped", summary: "ACE disabled" } });
  }

  const workspaceId = process.env.WORKSPACE_ID!;
  const result = await runAce({ workspaceId, trigger: "cron" });

  return NextResponse.json({ ok: true, result });
}
