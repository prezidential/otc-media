"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import { PageHeader } from "../components/page-header";
import { cn } from "@/lib/utils";
import { studioInner } from "@/lib/studio/inner-classes";

type SessionRow = {
  id: string;
  title: string;
  brand_profile_id: string | null;
  created_at: string;
  updated_at: string;
};

type SessionDetail = SessionRow & {
  artifact_json: Record<string, unknown> | null;
};

type MsgRow = {
  id: string;
  role: string;
  content: string;
  tool_calls: unknown;
  tool_results: unknown;
  created_at: string;
};

type BrandRow = { id: string; name: string };

function BrainstormPageInner() {
  const searchParams = useSearchParams();
  const urlSignalId = searchParams.get("signalId")?.trim() ?? "";

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetail | null>(null);
  const [messages, setMessages] = useState<MsgRow[]>([]);
  const [brands, setBrands] = useState<BrandRow[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [promoteBrandId, setPromoteBrandId] = useState<string>("");
  const [input, setInput] = useState("");
  const [pinnedSignal, setPinnedSignal] = useState<{ id: string; title: string } | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [streamEnabled, setStreamEnabled] = useState(false);
  const [streamPreview, setStreamPreview] = useState("");
  const [hubBusy, setHubBusy] = useState<"confirm" | "promote" | null>(null);
  const [promoteNotice, setPromoteNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const res = await fetch("/api/brainstorm/sessions");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      const list = (data as { sessions?: SessionRow[] }).sessions ?? [];
      setSessions(list);
      return list;
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadBrands = useCallback(async () => {
    const res = await fetch("/api/brand-profiles/list");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const rows = (data as { brandProfiles?: BrandRow[] }).brandProfiles ?? [];
    setBrands(Array.isArray(rows) ? rows : []);
  }, []);

  const loadSessionDetail = useCallback(async (sid: string) => {
    const res = await fetch(`/api/brainstorm/sessions/${encodeURIComponent(sid)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    const s = (data as { session?: SessionDetail }).session;
    if (s) {
      setSessionDetail(s);
      setPromoteBrandId((prev) => {
        if (prev) return prev;
        if (s.brand_profile_id) return s.brand_profile_id;
        return prev;
      });
    }
  }, []);

  const loadMessages = useCallback(async (sid: string) => {
    setLoadingMsgs(true);
    setError(null);
    try {
      const res = await fetch(`/api/brainstorm/sessions/${encodeURIComponent(sid)}/messages`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      setMessages((data as { messages?: MsgRow[] }).messages ?? []);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    void loadBrands();
  }, [loadBrands]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadSessions();
      if (cancelled || !list) return;
      if (list.length > 0) {
        setSessionId(list[0]!.id);
        return;
      }
      const res = await fetch("/api/brainstorm/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Brainstorm" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      const s = (data as { session?: SessionRow }).session;
      if (s?.id) {
        setSessions([s]);
        setSessionId(s.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSessions]);

  useEffect(() => {
    if (!sessionId) return;
    void loadMessages(sessionId);
    void loadSessionDetail(sessionId);
  }, [sessionId, loadMessages, loadSessionDetail]);

  useEffect(() => {
    if (!urlSignalId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/signals/${encodeURIComponent(urlSignalId)}`);
      const data = await res.json().catch(() => ({}));
      if (cancelled || !res.ok) return;
      const sig = (data as { signal?: { id: string; title: string } }).signal;
      if (sig?.id) setPinnedSignal({ id: sig.id, title: sig.title });
    })();
    return () => {
      cancelled = true;
    };
  }, [urlSignalId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, streamPreview]);

  async function newSession() {
    setError(null);
    const res = await fetch("/api/brainstorm/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Brainstorm",
        ...(brandId ? { brandProfileId: brandId } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError((data as { error?: string }).error ?? `Error ${res.status}`);
      return;
    }
    const s = (data as { session?: SessionRow }).session;
    if (s?.id) {
      setSessions((prev) => [s, ...prev]);
      setSessionId(s.id);
      setMessages([]);
      setSessionDetail(null);
      setPromoteBrandId(s.brand_profile_id ?? brandId ?? "");
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !sessionId || sending) return;
    setInput("");
    setSending(true);
    setError(null);
    setStreamPreview("");
    try {
      if (streamEnabled) {
        const res = await fetch(`/api/brainstorm/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            stream: true,
            ...(pinnedSignal ? { signalId: pinnedSignal.id } : {}),
          }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          setError((errBody as { error?: string }).error ?? `Error ${res.status}`);
          return;
        }
        if (!res.body) {
          setError("Streaming response had no body");
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          for (;;) {
            const nl = buf.indexOf("\n");
            if (nl < 0) break;
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            let ev: { type?: string; text?: string; messages?: MsgRow[]; message?: string };
            try {
              ev = JSON.parse(line) as { type?: string; text?: string; messages?: MsgRow[]; message?: string };
            } catch {
              continue;
            }
            if (ev.type === "delta" && typeof ev.text === "string") {
              setStreamPreview((p) => p + ev.text);
            }
            if (ev.type === "error") {
              setError(typeof ev.message === "string" ? ev.message : "Stream error");
            }
            if (ev.type === "done" && Array.isArray(ev.messages)) {
              setMessages(ev.messages);
              setStreamPreview("");
            }
          }
        }
        await loadSessions();
        await loadSessionDetail(sessionId);
      } else {
        const res = await fetch(`/api/brainstorm/sessions/${encodeURIComponent(sessionId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: text,
            ...(pinnedSignal ? { signalId: pinnedSignal.id } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((data as { error?: string }).error ?? `Error ${res.status}`);
          return;
        }
        setMessages((data as { messages?: MsgRow[] }).messages ?? []);
        await loadSessions();
        await loadSessionDetail(sessionId);
      }
    } finally {
      setSending(false);
    }
  }

  const artifact = sessionDetail?.artifact_json ?? null;
  const pendingManual =
    artifact && typeof artifact.pending_manual_signal === "object" && artifact.pending_manual_signal !== null
      ? (artifact.pending_manual_signal as { title?: string; url?: string; notes?: string })
      : null;
  const workingArtifact =
    artifact && typeof artifact.working_artifact === "object" && artifact.working_artifact !== null
      ? (artifact.working_artifact as Record<string, unknown>)
      : null;

  async function confirmManualSignal() {
    if (!sessionId) return;
    setHubBusy("confirm");
    setError(null);
    try {
      const res = await fetch(
        `/api/brainstorm/sessions/${encodeURIComponent(sessionId)}/confirm-manual-signal`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      await loadSessionDetail(sessionId);
    } finally {
      setHubBusy(null);
    }
  }

  async function promoteToIssue() {
    if (!sessionId) return;
    const bp = promoteBrandId.trim() || sessionDetail?.brand_profile_id || "";
    if (!bp) {
      setError("Choose a brand profile for promotion (session may have none).");
      return;
    }
    setHubBusy("promote");
    setError(null);
    setPromoteNotice(null);
    try {
      const res = await fetch(`/api/brainstorm/sessions/${encodeURIComponent(sessionId)}/promote-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandProfileId: bp }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? `Error ${res.status}`);
        return;
      }
      const draftId = (data as { draftId?: string }).draftId;
      await loadSessionDetail(sessionId);
      if (draftId) {
        setPromoteNotice(`Draft saved. Pick it from history on Issues (id starts with ${draftId.slice(0, 8)}…).`);
      }
    } finally {
      setHubBusy(null);
    }
  }

  return (
    <div className={studioInner.pageRoot}>
      <PageHeader
        variant="studio"
        title="Brainstorming"
        description="Ideate with the Brainstormer: signals, ingest, manual signal proposals, saved artifacts, optional streaming, and promote to Issues (DraftObject)."
      />

      {error && (
        <div className={cn(studioInner.card, "mb-4 border-[#C0442A]/30 bg-[#C0442A]/08")}>
          <p className="text-sm text-[#1F1A14]">{error}</p>
          <p className="mt-2 text-xs text-[#6B5F4E]">
            If columns are missing, re-run <code className="font-mono text-[11px]">lib/supabase/schema-brainstorm.sql</code> in Supabase (includes{" "}
            <code className="font-mono text-[11px]">artifact_json</code>).
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(200px,260px)_1fr]">
        <div className={cn(studioInner.card, "min-h-0 p-4")}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em] text-[#6B5F4E]">
              Sessions
            </span>
            <button
              type="button"
              onClick={() => void newSession()}
              className={cn(studioInner.btnSecondary, "shrink-0 px-3 py-1.5 text-xs")}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              New
            </button>
          </div>
          {loadingList ? (
            <div className="flex items-center gap-2 text-sm text-[#6B5F4E]">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSessionId(s.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      s.id === sessionId
                        ? "border-[#C8571E]/50 bg-[#C8571E]/10 font-medium text-[#1F1A14]"
                        : "border-[#E4D9C2] bg-[#F5EFE4] text-[#1F1A14] hover:bg-[#EBDFC5]/80"
                    )}
                  >
                    <span className="line-clamp-2">{s.title}</span>
                    <span className="mt-1 block font-mono text-[10px] text-[#6B5F4E]">
                      {new Date(s.updated_at).toLocaleString()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 border-t border-[#E4D9C2] pt-4">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">
              Brand profile (new sessions)
            </label>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className={cn(studioInner.select, "w-full text-[13px]")}
            >
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[11px] leading-snug text-[#6B5F4E]">
              Applies to <strong className="text-[#1F1A14]">New</strong> sessions. Existing sessions keep the profile set at creation.
            </p>
          </div>
        </div>

        <div className={cn(studioInner.card, "flex min-h-[480px] min-w-0 flex-col")}>
          <div className={studioInner.sectionLabel}>
            <Sparkles className="h-3.5 w-3.5" />
            Chat
          </div>

          <div className="mb-4 rounded-lg border border-[#E4D9C2] bg-[#FBF7EE] px-3 py-3 text-[12px] text-[#1F1A14]">
            <div className="font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E]">Session hub</div>
            {pendingManual && (
              <div className="mt-2 rounded-md border border-[#C8571E]/20 bg-[#F5EFE4] px-2 py-2">
                <p className="font-medium">{pendingManual.title ?? "(untitled)"}</p>
                {pendingManual.url ? <p className="mt-1 text-[11px] text-[#6B5F4E]">{pendingManual.url}</p> : null}
                {pendingManual.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-[#6B5F4E]">{pendingManual.notes}</p>
                ) : null}
                <button
                  type="button"
                  disabled={hubBusy !== null}
                  onClick={() => void confirmManualSignal()}
                  className={cn(studioInner.btnPrimary, "mt-2 px-3 py-1.5 text-xs")}
                >
                  {hubBusy === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Insert signal
                </button>
              </div>
            )}
            {workingArtifact && (
              <div className="mt-2 text-[11px] text-[#6B5F4E]">
                <span className="font-medium text-[#1F1A14]">Saved artifact</span>
                {typeof workingArtifact.thesis === "string" ? (
                  <p className="mt-1 line-clamp-2">{workingArtifact.thesis}</p>
                ) : null}
                {typeof workingArtifact.working_outline === "string" ? (
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{workingArtifact.working_outline}</p>
                ) : null}
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2 border-t border-[#E4D9C2] pt-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E]">
                  Brand for promote
                </label>
                <select
                  value={promoteBrandId}
                  onChange={(e) => setPromoteBrandId(e.target.value)}
                  className={cn(studioInner.select, "w-full text-[12px]")}
                >
                  <option value="">Default: session brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={
                  hubBusy !== null ||
                  !workingArtifact ||
                  (!promoteBrandId.trim() && !sessionDetail?.brand_profile_id)
                }
                onClick={() => void promoteToIssue()}
                className={cn(studioInner.btnSecondary, "shrink-0 px-3 py-2 text-xs")}
              >
                {hubBusy === "promote" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Promote to Issues
              </button>
            </div>
            {!pendingManual && !workingArtifact ? (
              <p className="mt-2 text-[11px] text-[#6B5F4E]">
                Use tools <code className="font-mono text-[10px]">propose_manual_signal</code> and{" "}
                <code className="font-mono text-[10px]">save_artifact_draft</code> in chat, then act here.
              </p>
            ) : null}
            {promoteNotice ? (
              <p className="mt-2 text-[12px] text-[#2D6A4F]">
                {promoteNotice}{" "}
                <Link href="/issues" className={studioInner.link}>
                  Open Issues
                </Link>
              </p>
            ) : null}
          </div>

          {pinnedSignal && (
            <div className="mb-3 rounded-lg border border-[#C8571E]/25 bg-[#C8571E]/08 px-3 py-2 text-[12px] text-[#1F1A14]">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#6B5F4E]">Pinned signal</span>
              <p className="mt-1 font-medium">{pinnedSignal.title}</p>
              <button
                type="button"
                className="mt-2 text-[11px] text-[#C8571E] hover:underline"
                onClick={() => setPinnedSignal(null)}
              >
                Clear pin
              </button>
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {loadingMsgs ? (
              <div className="flex items-center gap-2 text-sm text-[#6B5F4E]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading messages…
              </div>
            ) : messages.length === 0 ? (
              <p className="text-sm text-[#6B5F4E]">
                Ask about angles, summarize signals, or explore a headline. Tools include{" "}
                <code className="rounded bg-[#EBDFC5] px-1 font-mono text-[11px]">query_signals</code>,{" "}
                <code className="rounded bg-[#EBDFC5] px-1 font-mono text-[11px]">get_signal</code>,{" "}
                <code className="rounded bg-[#EBDFC5] px-1 font-mono text-[11px]">trigger_signal_ingest</code>, and more.
              </p>
            ) : (
              messages
                .filter((m) => m.role === "user" || m.role === "assistant")
                .map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[min(100%,52rem)] rounded-xl border px-4 py-3 text-[14px] leading-relaxed",
                      m.role === "user"
                        ? "ml-auto border-[#E4D9C2] bg-[#F5EFE4] text-[#1F1A14]"
                        : "border-[#E4D9C2] bg-[#FBF7EE] text-[#1F1A14]"
                    )}
                  >
                    <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E]">
                      {m.role === "user" ? "You" : "Brainstormer"}
                    </div>
                    <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</div>
                    {m.role === "assistant" && m.tool_calls != null && (
                      <p className="mt-2 border-t border-[#E4D9C2] pt-2 font-mono text-[10px] text-[#6B5F4E]">Tools used in this turn</p>
                    )}
                  </div>
                ))
            )}
            {streamPreview ? (
              <div className="max-w-[min(100%,52rem)] rounded-xl border border-dashed border-[#C8571E]/40 bg-[#FFFCF5] px-4 py-3 text-[13px] leading-relaxed text-[#1F1A14]">
                <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-[#6B5F4E]">Streaming…</div>
                <div className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{streamPreview}</div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <div className="mt-4 border-t border-[#E4D9C2] pt-4">
            <label className="mb-2 flex cursor-pointer items-center gap-2 text-[12px] text-[#6B5F4E]">
              <input
                type="checkbox"
                checked={streamEnabled}
                onChange={(e) => setStreamEnabled(e.target.checked)}
                className="rounded border-[#E4D9C2]"
              />
              Stream assistant tokens (NDJSON; uses markdown finals)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message… (Shift+Enter for newline)"
                rows={3}
                disabled={!sessionId || sending}
                className={cn(studioInner.textarea, "min-h-[88px] flex-1")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage();
                  }
                }}
              />
              <button
                type="button"
                disabled={!sessionId || sending || !input.trim()}
                onClick={() => void sendMessage()}
                className={cn(studioInner.btnPrimary, "shrink-0 self-stretch sm:self-auto")}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send
              </button>
            </div>
            <p className="mt-2 text-[11px] text-[#6B5F4E]">
              Configure <code className="font-mono text-[10px]">LLM_BRAINSTORM</code> like other roles in README.{" "}
              <Link href="/issues" className={studioInner.link}>
                Issues
              </Link>{" "}
              lists promoted drafts.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrainstormPageFallback() {
  return (
    <div className={studioInner.pageRoot}>
      <PageHeader
        variant="studio"
        title="Brainstorming"
        description="Ideate with the Brainstormer: signals, ingest, manual signal proposals, saved artifacts, optional streaming, and promote to Issues (DraftObject)."
      />
      <div className={cn(studioInner.card, "flex items-center gap-2 p-6 text-sm text-[#6B5F4E]")}>
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading…
      </div>
    </div>
  );
}

export default function BrainstormPage() {
  return (
    <Suspense fallback={<BrainstormPageFallback />}>
      <BrainstormPageInner />
    </Suspense>
  );
}
