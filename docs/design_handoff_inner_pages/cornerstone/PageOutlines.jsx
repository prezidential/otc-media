// Page: Outlines
function PageOutlines({ setPage }) {
  const t = window.T;
  const [showDisabled, setShowDisabled] = React.useState(false);
  const [selected, setSelected] = React.useState("Default newsletter issue");
  const [editSection, setEditSection] = React.useState(null);

  const OUTLINES = [
    { id: "default-newsletter", name: "Default newsletter issue", type: "NEWSLETTER", enabled: true },
    { id: "default-insider", name: "Default Insider Access", type: "INSIDER ACCESS", enabled: true },
    { id: "special-edition", name: "Special Edition", type: "NEWSLETTER", enabled: true },
    { id: "deep-dive-disabled", name: "Deep Dive (deprecated)", type: "NEWSLETTER", enabled: false },
  ];

  const SECTIONS = {
    "Default newsletter issue": [
      { id: 1, title: "Opening hook", prompt: "Write a compelling 2–3 sentence hook that anchors the issue's central tension. Use a concrete recent event. Avoid 'In a world where…' constructions. Tone: direct, confident." },
      { id: 2, title: "Market map", prompt: "Lay out the landscape in 150–200 words. Who are the key players? What's shifting? Use signal data to ground claims. No vendor lists — focus on structural dynamics." },
      { id: 3, title: "The core argument", prompt: "State the issue's thesis in one crisp paragraph. This is the payoff of the opening hook. Support with 2–3 data points from approved leads." },
      { id: 4, title: "Case study", prompt: "Select the strongest approved lead and build a 200-word case study around it. Practitioner-level detail. Avoid press-release framing." },
      { id: 5, title: "What to watch", prompt: "3 forward-looking signals the reader should track. Bullet format. Each bullet: [Signal] → [Why it matters]. Keep under 100 words total." },
      { id: 6, title: "The takeaway", prompt: "Close with a single, memorable sentence the reader will repeat to a colleague. No hedging. Should feel like the punchline the whole issue was building to." },
    ],
    "Default Insider Access": [
      { id: 1, title: "Insider brief", prompt: "Premium summary for paying subscribers. Higher signal density, shorter word count. Lead with the most non-obvious insight from the week's research." },
      { id: 2, title: "Exclusive analysis", prompt: "400-word deep analysis not published in the free issue. Cite proprietary data or practitioner sources where possible." },
      { id: 3, title: "Access resources", prompt: "Link 2–3 resources that required real effort to surface (not just Googling). Briefly explain why each is worth the time." },
      { id: 4, title: "Ask the editor", prompt: "Answer one hypothetical question the ideal subscriber would ask this week. 150 words max. Conversational, direct." },
    ],
    "Special Edition": [
      { id: 1, title: "Event context", prompt: "Explain the occasion for this special edition in 2 sentences. Be specific about why now." },
      { id: 2, title: "Feature essay", prompt: "600–800 word feature. Narrative-driven. Build toward a surprising or counterintuitive conclusion. Use concrete examples throughout." },
      { id: 3, title: "Rapid reactions", prompt: "4–6 short takes (50 words each) from different angles: practitioner, investor, skeptic, optimist." },
    ],
  };

  const sections = SECTIONS[selected] || [];
  const visible = showDisabled ? OUTLINES : OUTLINES.filter(o => o.enabled);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, fontFamily: t.mono, fontSize: 12, color: t.sub }}>
        <span style={{ cursor: "pointer", color: t.accent }} onClick={() => setPage && setPage("issues")}>‹ Back to Issues</span>
      </div>
      <PageHeader title="Content outlines" sub="Structured prompts for newsletter and Insider Access generation. Disabled outlines are kept for history." />

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 20, alignItems: "start" }}>
        {/* Library */}
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <SectionLabel>Library</SectionLabel>
            <Btn size="sm">+ New outline</Btn>
          </div>
          <div style={{ padding: "10px 0" }}>
            {visible.map(o => (
              <div key={o.id} onClick={() => setSelected(o.name)} style={{
                padding: "12px 18px", cursor: "pointer",
                background: selected === o.name ? t.chip : "transparent",
                borderLeft: selected === o.name ? `3px solid ${t.accent}` : "3px solid transparent",
                transition: "background 100ms",
              }}>
                <div style={{ fontSize: 14, fontWeight: selected === o.name ? 500 : 400, color: t.ink }}>{o.name}</div>
                <div style={{ fontFamily: t.mono, fontSize: 9, letterSpacing: 1.5, color: t.sub, marginTop: 3, textTransform: "uppercase" }}>{o.type}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 18px", borderTop: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={showDisabled} onChange={e => setShowDisabled(e.target.checked)}
              style={{ accentColor: t.accent }} />
            <span style={{ fontSize: 12, color: t.sub }}>Show disabled</span>
          </div>
        </Card>

        {/* Detail */}
        {selected ? (
          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 22px", borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: t.serif, fontSize: 22, fontStyle: "italic" }}>{selected}</div>
                <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 1.5, color: t.sub, marginTop: 3, textTransform: "uppercase" }}>
                  {OUTLINES.find(o => o.name === selected)?.type} · {sections.length} sections
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" size="sm">Disable</Btn>
                <Btn size="sm">Save changes</Btn>
              </div>
            </div>
            <div style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
              {sections.map((s, i) => (
                <div key={s.id} style={{
                  border: `1px solid ${editSection === s.id ? t.accent : t.line}`,
                  borderRadius: 10, overflow: "hidden",
                  transition: "border-color 120ms",
                }}>
                  <div
                    onClick={() => setEditSection(editSection === s.id ? null : s.id)}
                    style={{
                      padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                      background: editSection === s.id ? `${t.accent}08` : "transparent",
                    }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: "50%", background: t.chip,
                      display: "grid", placeItems: "center",
                      fontFamily: t.mono, fontSize: 11, color: t.sub, flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ fontWeight: 500, fontSize: 14, flex: 1 }}>{s.title}</div>
                    <div style={{ fontFamily: t.mono, fontSize: 10, color: t.sub }}>{editSection === s.id ? "collapse" : "edit"}</div>
                  </div>
                  {editSection === s.id ? (
                    <div style={{ padding: "0 16px 16px" }}>
                      <Textarea value={s.prompt} onChange={() => {}} rows={4} />
                    </div>
                  ) : (
                    <div style={{ padding: "0 16px 14px", fontSize: 12, color: t.sub, lineHeight: 1.6 }}>
                      {s.prompt.slice(0, 120)}…
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card style={{ display: "grid", placeItems: "center", minHeight: 400 }}>
            <div style={{ textAlign: "center", color: t.sub }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>▤</div>
              <div style={{ fontFamily: t.serif, fontStyle: "italic", fontSize: 20 }}>Select an outline or create a new one.</div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
Object.assign(window, { PageOutlines });
