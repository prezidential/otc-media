import { NextResponse } from "next/server";

export async function POST(req: Request) {
  let origin = "";
  try {
    origin = new URL(req.url).origin;
  } catch {
    origin = "http://localhost:3000";
  }

  const body = await req.json().catch(() => ({}));
  const limitPerFeed = Number(body.limitPerFeed) || 15;

  const cadences = ["daily", "weekly"] as const;
  const results: Record<string, { ok: boolean; inserted: number; skipped: number; error?: string }> = {};

  for (const cadence of cadences) {
    try {
      const res = await fetch(`${origin}/api/research/run-directives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadence, limitPerFeed }),
      });
      const data = await res.json().catch(() => ({}));
      results[cadence] = {
        ok: data.ok ?? res.ok,
        inserted: data.inserted ?? 0,
        skipped: data.skipped ?? 0,
        ...(data.error && { error: data.error }),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[cadence] = { ok: false, inserted: 0, skipped: 0, error: message };
    }
  }

  const totalInserted = Object.values(results).reduce((s, r) => s + r.inserted, 0);
  const totalSkipped = Object.values(results).reduce((s, r) => s + r.skipped, 0);
  const allOk = Object.values(results).every((r) => r.ok);

  return NextResponse.json({
    ok: allOk,
    inserted: totalInserted,
    skipped: totalSkipped,
    results,
  });
}
