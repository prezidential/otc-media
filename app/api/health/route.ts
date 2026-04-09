import { NextResponse } from "next/server";

/**
 * Readiness probe: checks required env vars exist (no secret values returned).
 */
export async function GET() {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasSecret = Boolean(process.env.SUPABASE_SECRET_KEY?.trim());
  const hasWorkspace = Boolean(process.env.WORKSPACE_ID?.trim());
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY?.trim());

  const checks = {
    supabase_url: hasUrl,
    supabase_secret: hasSecret,
    workspace_id: hasWorkspace,
    anthropic_api_key: hasAnthropic,
  };

  const ok = hasUrl && hasSecret && hasWorkspace;

  return NextResponse.json(
    {
      ok,
      service: "otc-media",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}
