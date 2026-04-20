// Page: Research Console
function PageResearch({ setPage }) {
  const t = window.T;
  const [running, setRunning] = React.useState(null);
  const [streamLines, setStreamLines] = React.useState([]);

  const DIRECTIVES = [
    { id: 1, freq: "DAILY", topic: "AI agent security risks, prompt injection, tool-use exploits, LLM guardrails, and autonomous system governance.", lastRun: "4/10", sources: 8 },
    { id: 2, freq: "WEEKLY", topic: "Cloud infrastructure entitlement management, cloud IAM, and multi-cloud identity posture.", lastRun: "4/07", sources: 5 },
    { id: 3, freq: "DAILY", topic: "Agentic AI frameworks, LangChain, LlamaIndex, AutoGen, CrewAI — product and ecosystem developments.", lastRun: "4/10", sources: 6 },
    { id: 4, freq: "WEEKLY", topic: "B2B SaaS pricing trends, packaging strategy, and usage-based billing models.", lastRun: "4/06", sources: 4 },
    { id: 5, freq: "DAILY", topic: "Newsletter operator business models, creator monetization, and audience growth strategies.", lastRun: "4/10", sources: 7 },
  ];

  const RUNS = [
    { status: "completed", time: "4/10/2026, 9:54 AM → 9:54 AM", result: "+27 inserted, 230 skipped", type: "ingest" },
    { status: "completed", time: "4/10/2026, 3:52 AM → 3:52 AM", result: "Produced newsletter draft: 'Static Security Fails Against Dynamic AI' — 7,520 words. Covers breakdown of traditional security frameworks.", type: "draft" },
    { status: "completed", time: "4/09/2026, 9:54 AM → 9:55 AM", result: "+19 inserted, 211 skipped", type: "ingest" },
    { status: "failed", time: "4/08/2026, 3:52 AM", result: "Timeout — research directive exceeded 60s. No leads written.", type: "error" },
  ];

  const runAction = (label, lines) => {
    if (running) return;
    setRunning(label); setStreamLines([]);
    lines.forEach((line, i) => {
      setTimeout(() => setStreamLines(p => [...p, line]), i * 600);
    });
    setTimeout(() => setRunning(null), lines.length * 600 + 800);
  };

  const pipelineActions = [
    {
      label: "Research + write leads",
      sub: "Run all daily directives and generate leads from findings",
      lines: ["Fetching signals from 8 sources…", "Clustering by directive…", "Running LLM analysis on 47 candidates…", "Writing 3 leads from top findings…", "Done — 3 leads written, awaiting approval."],
    },
    {
      label: "Generate newsletter draft",
      sub: "Run editor agent on approved leads → issue draft",
      lines: ["Loading approved leads (2)…", "Applying editorial steering: Practitioner Tactical…", "Drafting sections (1/6)…", "Drafting sections (4/6)…", "Draft complete — 3,840 words."],
    },
    {
      label: "Run full pipeline",
      sub: "Research → leads → draft in one pass",
      lines: ["Starting full pipeline run…", "Research phase complete — 5 leads surfaced…", "Editorial phase: drafting…", "Draft written — 4,100 words.", "Pipeline complete. Review in Issues →"],
    },
  ];

  return (
    <div>
      <PageHeader title="Research Console" sub="Manage directives and ingest signals from RSS feeds" />

      {/* Agent pipeline */}
      <Card style={{ marginBottom: 20 }}>
        <SectionLabel>Agent pipeline</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: running ? 16 : 0 }}>
          {pipelineActions.map(a => (
            <div key={a.label} onClick={() => runAction(a.label, a.lines)} style={{
              padding: "16px 18px", border: `1px solid ${running === a.label ? t.accent : t.line}`,
              borderRadius: 10, cursor: running ? "default" : "pointer",
              background: running === a.label ? `${t.accent}08` : "transparent",
              transition: "border-color 120ms, background 120ms",
            }}>
              <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{a.label}</div>
              <div style={{ fontSize: 12, color: t.sub, lineHeight: 1.45 }}>{a.sub}</div>
              {running === a.label && (
                <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 10, height: 10, border: `2px solid ${t.line}`,
                    borderTopColor: t.accent, borderRadius: "50%",
                    animation: "spin 0.7s linear infinite", flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: t.mono, fontSize: 10, color: t.accent }}>running…</span>
                </div>
              )}
            </div>
          ))}
        </div>
        {streamLines.length > 0 && (
          <div style={{
            background: t.bg, border: `1px solid ${t.line}`, borderRadius: 8,
            padding: "12px 16px", fontFamily: t.mono, fontSize: 12, color: t.sub, lineHeight: 1.8,
          }}>
            {streamLines.map((l, i) => (
              <div key={i} style={{ color: i === streamLines.length - 1 ? t.ink : t.sub }}>
                <span style={{ color: t.accent }}>›</span> {l}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Manual ingest controls */}
      <Card style={{ marginBottom: 20 }}>
        <SectionLabel>Manual ingest controls</SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          {["Run all directives", "Run daily", "Run weekly"].map(label => (
            <Btn key={label} variant="secondary" onClick={() => runAction(label, ["Starting " + label.toLowerCase() + "…", "Fetching from sources…", "Done."])}>
              {label}
            </Btn>
          ))}
        </div>
      </Card>

      {/* 2-col: directives + runs */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Directives */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SectionLabel>Directives ({DIRECTIVES.length})</SectionLabel>
            <Btn size="sm">+ New</Btn>
          </div>
          {DIRECTIVES.map((d, i) => (
            <div key={d.id} style={{
              padding: "16px 20px",
              borderBottom: i < DIRECTIVES.length - 1 ? `1px solid ${t.line}` : "none",
            }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <Tag color={d.freq === "DAILY" ? "orange" : undefined}>{d.freq}</Tag>
                <span style={{ fontFamily: t.mono, fontSize: 10, color: t.sub }}>{d.sources} sources · last {d.lastRun}</span>
              </div>
              <div style={{ fontSize: 13, color: t.ink, lineHeight: 1.45 }}>{d.topic}</div>
            </div>
          ))}
        </Card>

        {/* Recent runs */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${t.line}` }}>
            <SectionLabel>Recent runs</SectionLabel>
          </div>
          {RUNS.map((r, i) => (
            <div key={i} style={{
              padding: "16px 20px",
              borderBottom: i < RUNS.length - 1 ? `1px solid ${t.line}` : "none",
            }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 5, alignItems: "center" }}>
                <div style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: r.status === "completed" ? t.accent2 : r.status === "failed" ? "#B83232" : t.accent,
                  flexShrink: 0,
                }} />
                <span style={{ fontFamily: t.mono, fontSize: 10, color: r.status === "completed" ? t.accent2 : "#B83232", letterSpacing: 0.5 }}>
                  {r.status}
                </span>
                <span style={{ fontFamily: t.mono, fontSize: 10, color: t.sub, marginLeft: "auto" }}>{r.time}</span>
              </div>
              <div style={{ fontSize: 12, color: t.ink, lineHeight: 1.5 }}>{r.result}</div>
            </div>
          ))}
        </Card>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
Object.assign(window, { PageResearch });
