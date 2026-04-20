// Page: Issues (Issue Draft)
function PageIssues({ setPage }) {
  const t = window.T;
  const [brand, setBrand] = React.useState("Identity Jedi Newsletter");
  const [issueType, setIssueType] = React.useState("full issue");
  const [outline, setOutline] = React.useState("Default newsletter issue");
  const [steeringOpen, setSteeringOpen] = React.useState(false);
  const [persona, setPersona] = React.useState("Practitioner Tactical");
  const [aggression, setAggression] = React.useState(3);
  const [audience, setAudience] = React.useState("practitioner");
  const [focus, setFocus] = React.useState("architecture");
  const [tone, setTone] = React.useState("strategic");
  const [maxLeads, setMaxLeads] = React.useState(6);
  const [phase2Open, setPhase2Open] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [draft, setDraft] = React.useState(`**Static Security Fails Against Dynamic AI**

The attack surface is no longer static. As AI agents begin operating autonomously within enterprise environments — browsing, writing, executing — the assumptions underlying most security frameworks begin to collapse.

*This issue examines three inflection points: prompt injection at scale, the death of perimeter security, and why "human in the loop" is becoming a compliance fiction.*

---

**The Prompt Injection Problem Has Grown Up**

Early prompt injection was a party trick. Researchers would cajole a chatbot into ignoring its system prompt. Amusing, low-stakes, quickly patched.

That era is over. Today's attacks target agentic pipelines — systems where an LLM doesn't just answer questions but takes actions: booking meetings, sending emails, querying databases, executing code.`);

  const personas = ["CISO Aggressive", "Board Brief", "Practitioner Tactical", "Reflective Operator"];

  const runGenerate = () => {
    setGenerating(true);
    setTimeout(() => setGenerating(false), 2200);
  };

  return (
    <div>
      <PageHeader title="Issue Draft" sub="Generate newsletter issue drafts from approved leads" />

      {/* Generation card */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>Generation</SectionLabel>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
          <Select value={brand} onChange={setBrand}
            options={["Identity Jedi Newsletter", "B2B Creator Weekly"]} style={{ minWidth: 220 }} />
          <Select value={issueType} onChange={setIssueType}
            options={["full issue", "insider access", "quick brief"]} />
          <Select value={outline} onChange={setOutline}
            options={["Default newsletter issue ★", "Default Insider Access", "Special Edition"]} style={{ minWidth: 210 }} />
          <Btn onClick={runGenerate} disabled={generating} style={{ marginLeft: "auto" }}>
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 12, height: 12, border: "2px solid rgba(251,247,238,0.3)",
                  borderTopColor: "#FBF7EE", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite", display: "inline-block",
                }} />
                Generating…
              </span>
            ) : "Generate issue draft"}
          </Btn>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 16, fontFamily: t.mono, fontSize: 11, color: t.sub }}>
            <span>Content outlines: <span style={{ color: t.ink }}>3 in database</span></span>
            <span style={{ cursor: "pointer", color: t.accent, textDecoration: "underline" }}
              onClick={() => setPage && setPage("outlines")}>Manage outlines</span>
            <span style={{ cursor: "pointer", color: t.sub, textDecoration: "underline" }}>Seed defaults</span>
          </div>
          <Btn variant="secondary" size="sm">⟳ History</Btn>
        </div>
      </Card>

      {/* Editorial Steering — collapsible */}
      <Card style={{ marginBottom: 16 }}>
        <div onClick={() => setSteeringOpen(o => !o)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
        }}>
          <SectionLabel>Editorial steering</SectionLabel>
          <span style={{ fontFamily: t.mono, fontSize: 16, color: t.sub, marginBottom: 10, transform: steeringOpen ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>⌄</span>
        </div>
        {steeringOpen && (
          <div>
            {/* Persona presets */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              {personas.map(p => (
                <div key={p} onClick={() => setPersona(p)} style={{
                  padding: "7px 14px", borderRadius: 999, cursor: "pointer", fontSize: 12,
                  background: persona === p ? t.ink : "transparent",
                  color: persona === p ? t.bg : t.sub,
                  border: `1px solid ${persona === p ? t.ink : t.line}`,
                  fontWeight: persona === p ? 500 : 400,
                }}>{p}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto auto 1fr 1fr 1fr auto", gap: 14, alignItems: "center" }}>
              {/* Aggression */}
              <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: t.sub }}>Aggression</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="range" min={1} max={5} value={aggression}
                  onChange={e => setAggression(Number(e.target.value))}
                  style={{ width: 80, accentColor: t.accent }} />
                <span style={{ fontFamily: t.mono, fontSize: 12, color: t.ink, width: 12 }}>{aggression}</span>
              </div>
              <Select value={audience} onChange={setAudience}
                options={["practitioner", "executive", "investor", "founder"]}
                style={{ fontSize: 12 }} />
              <Select value={focus} onChange={setFocus}
                options={["architecture", "strategy", "ops", "product"]}
                style={{ fontSize: 12 }} />
              <Select value={tone} onChange={setTone}
                options={["strategic", "direct", "analytical", "narrative"]}
                style={{ fontSize: 12 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: t.mono, fontSize: 11, color: t.sub }}>
                Max leads
                <input type="number" value={maxLeads} onChange={e => setMaxLeads(e.target.value)}
                  style={{
                    width: 44, padding: "6px 8px", fontFamily: t.mono, fontSize: 12,
                    background: t.bg, color: t.ink, border: `1px solid ${t.line}`, borderRadius: 6,
                  }} />
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Phase 2 — accordion */}
      <Card style={{ marginBottom: 20 }}>
        <div onClick={() => setPhase2Open(o => !o)} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer",
        }}>
          <SectionLabel>⇌ Phase 2 — content products</SectionLabel>
          <span style={{ fontFamily: t.mono, fontSize: 16, color: t.sub, marginBottom: 10, transform: phase2Open ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>⌄</span>
        </div>
        {phase2Open && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {["LinkedIn post", "Twitter/X thread", "Podcast script", "Email subject lines"].map(p => (
              <div key={p} style={{
                padding: "12px 14px", border: `1px solid ${t.line}`,
                borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <span style={{ fontSize: 13 }}>{p}</span>
                <Btn variant="secondary" size="sm">Generate</Btn>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Draft preview */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <SectionLabel>Draft preview</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="secondary" size="sm" onClick={runGenerate}>⟳ Regenerate</Btn>
            <Btn variant="secondary" size="sm">Copy</Btn>
            <Btn variant="secondary" size="sm">⟨/⟩ Export HTML</Btn>
          </div>
        </div>
        <div style={{
          background: t.bg, border: `1px solid ${t.line}`, borderRadius: 10,
          padding: "22px 24px", position: "relative",
        }}>
          {generating && (
            <div style={{
              position: "absolute", inset: 0, background: `${t.panel}CC`,
              borderRadius: 10, display: "grid", placeItems: "center", zIndex: 2,
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{
                  width: 24, height: 24, border: `2px solid ${t.line}`,
                  borderTopColor: t.accent, borderRadius: "50%",
                  animation: "spin 0.7s linear infinite", margin: "0 auto 12px",
                }} />
                <div style={{ fontFamily: t.serif, fontStyle: "italic", fontSize: 16, color: t.sub }}>Generating draft…</div>
              </div>
            </div>
          )}
          <Textarea value={draft} onChange={e => setDraft(e.target.value)} rows={12} />
        </div>
      </Card>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
Object.assign(window, { PageIssues });
