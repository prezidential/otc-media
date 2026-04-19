import { NextResponse } from "next/server";
import { runAce } from "@/lib/ace/orchestrator";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const forceRerun = Boolean(body.forceRerun);
  const workspaceId = process.env.WORKSPACE_ID!;
  const result = await runAce({ workspaceId, trigger: "manual", forceRerun });
  return NextResponse.json(result);
}
