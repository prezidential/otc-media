import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { SearchResultPayload } from "@/lib/search/types";

/** Avoid breaking PostgREST `ilike` patterns and cap length. */
function sanitizeIlikeFragment(raw: string): string {
  return raw.replace(/[%_\\]/g, " ").trim().slice(0, 80);
}

function dedupeSignals<T extends { id?: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = r.id ?? JSON.stringify(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

export async function GET(req: Request) {
  const workspaceId = process.env.WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "WORKSPACE_ID not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") ?? "").trim();
  const fragment = sanitizeIlikeFragment(qRaw);
  if (!fragment) {
    const empty: SearchResultPayload = { signals: [], leads: [], drafts: [], outlines: [] };
    return NextResponse.json(empty);
  }

  const pattern = `%${fragment}%`;
  const supabase = supabaseAdmin();

  const [byTitle, byPublisher, leadsRes, draftsRes, outlinesRes] = await Promise.all([
    supabase
      .from("signals")
      .select("id,title,url,publisher")
      .eq("workspace_id", workspaceId)
      .ilike("title", pattern)
      .order("captured_at", { ascending: false })
      .limit(6),
    supabase
      .from("signals")
      .select("id,title,url,publisher")
      .eq("workspace_id", workspaceId)
      .ilike("publisher", pattern)
      .order("captured_at", { ascending: false })
      .limit(6),
    supabase
      .from("editorial_leads")
      .select("id,angle,status")
      .eq("workspace_id", workspaceId)
      .ilike("angle", pattern)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("issue_drafts")
      .select("id,content,created_at")
      .eq("workspace_id", workspaceId)
      .ilike("content", pattern)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("content_outlines")
      .select("id,name,kind")
      .eq("workspace_id", workspaceId)
      .is("disabled_at", null)
      .ilike("name", pattern)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  const sigRows = dedupeSignals([...(byTitle.data ?? []), ...(byPublisher.data ?? [])]).slice(0, 8);
  const signals = sigRows.map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ""),
    url: String(r.url ?? ""),
    publisher: String(r.publisher ?? ""),
  }));

  const leads = (leadsRes.data ?? []).map((r) => ({
    id: String(r.id),
    angle: String(r.angle ?? ""),
    status: String(r.status ?? ""),
  }));

  const drafts = (draftsRes.data ?? []).map((r) => {
    const text = (r.content as string) ?? "";
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 120);
    return {
      id: String(r.id),
      preview: preview || "(empty)",
      created_at: String(r.created_at ?? ""),
    };
  });

  const outlines = (outlinesRes.data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    kind: String(r.kind ?? ""),
  }));

  const errs = [byTitle.error, byPublisher.error, leadsRes.error, draftsRes.error, outlinesRes.error].filter(
    Boolean
  );
  if (errs.length > 0) {
    return NextResponse.json({ error: (errs[0] as { message: string }).message }, { status: 500 });
  }

  const payload: SearchResultPayload = { signals, leads, drafts, outlines };
  return NextResponse.json(payload);
}
