// Page: Signals
function PageSignals({ setPage }) {
  const t = window.T;
  const [feedUrl, setFeedUrl] = React.useState("https://www.darkreading.com/rss.xml");
  const [ingesting, setIngesting] = React.useState(false);
  const [ingestCount, setIngestCount] = React.useState(0);
  const [ingestDone, setIngestDone] = React.useState(false);
  const [topicOpen, setTopicOpen] = React.useState(false);
  const [topicText, setTopicText] = React.useState("");
  const [topicToast, setTopicToast] = React.useState(false);
  const [filter, setFilter] = React.useState("All");
  const [hovered, setHovered] = React.useState(null);
  const [promoted, setPromoted] = React.useState([]);

  const SIGNALS = [
    { id: 1, title: "The Download: Jeff VanderMeer story and AI models too scary to release", source: "MIT Technology Review", date: "4/10", topic: "AI", heat: 92, novelty: 88 },
    { id: 2, title: "What's in a name? Moderna's \"vaccine\" vs. \"therapy\" dilemma", source: "MIT Technology Review", date: "4/10", topic: "Biotech", heat: 67, novelty: 71 },
    { id: 3, title: "Inside the lab teaching robots to fold laundry (finally)", source: "The Verge", date: "4/09", topic: "Robotics", heat: 54, novelty: 82 },
    { id: 4, title: "Why the next great search engine might not have a search box", source: "Wired", date: "4/09", topic: "AI", heat: 88, novelty: 95 },
    { id: 5, title: "Climate startups are quietly buying up farmland", source: "Bloomberg", date: "4/08", topic: "Climate", heat: 73, novelty: 64 },
    { id: 6, title: "A field guide to the new generation of open-source LLMs", source: "Ars Technica", date: "4/08", topic: "AI", heat: 81, novelty: 58 },
    { id: 7, title: "The quiet death of the smart home hub", source: "The Verge", date: "4/07", topic: "Consumer", heat: 42, novelty: 76 },
    { id: 8, title: "How three friends built a $40M newsletter in 18 months", source: "The Information", date: "4/07", topic: "Media", heat: 94, novelty: 80 },
    { id: 9, title: "Anthropic's new safety framework and what it means for enterprise AI", source: "VentureBeat", date: "4/06", topic: "AI", heat: 77, novelty: 66 },
    { id: 10, title: "The longevity startup that wants to sequence your gut microbiome", source: "Stat News", date: "4/06", topic: "Biotech", heat: 61, novelty: 88 },
  ];

  const topics = ["All", "AI", "Biotech", "Robotics", "Climate", "Media", "Consumer"];
  const visible = SIGNALS.filter(s => !promoted.includes(s.id) && (filter === "All" || s.topic === filter));

  const runIngest = () => {
    if (ingesting) return;
    setIngesting(true); setIngestCount(0); setIngestDone(false);
    let n = 0;
    const iv = setInterval(() => {
      n += Math.floor(Math.random() * 3) + 1;
      if (n >= 27) {
        n = 27; clearInterval(iv);
        setTimeout(() => { setIngesting(false); setIngestDone(true); }, 400);
      }
      setIngestCount(n);
    }, 85);
  };

  const promote = (s) => {
    setPromoted(p => [...p, s.id]);
    setTopicToast(`↗ "${s.title.slice(0, 38)}…" promoted to Lead`);
    setTimeout(() => setTopicToast(false), 2600);
  };

  return (
    <div>
      <PageHeader title="Signals" sub="Ingest RSS feeds and browse captured signals" />

      {/* Pipeline breadcrumb */}
      <Card style={{ marginBottom: 20, padding: "14px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: t.mono, fontSize: 11, letterSpacing: 0.5 }}>
          <span style={{ color: t.accent, cursor: "pointer" }} onClick={() => setPage && setPage("research")}>Research</span>
          <span style={{ color: t.sub }}>›</span>
          <span style={{ color: t.ink, fontWeight: 600 }}>Signals</span>
          <span style={{ color: t.sub }}>›</span>
          <span style={{ color: t.sub, cursor: "pointer" }} onClick={() => setPage && setPage("leads")}>Leads <span style={{ opacity: 0.7 }}>(approve)</span></span>
          <span style={{ color: t.sub }}>›</span>
          <span style={{ color: t.sub, cursor: "pointer" }} onClick={() => setPage && setPage("issues")}>Issues <span style={{ opacity: 0.7 }}>(draft)</span></span>
          <span style={{ color: t.sub }}>›</span>
          <span style={{ color: t.sub, cursor: "pointer" }} onClick={() => setPage && setPage("outlines")}>Outlines</span>
          <div style={{ marginLeft: "auto" }}>
            {ingestDone
              ? <Tag color="green">+27 ingested</Tag>
              : <Tag color="orange">Stale · last ingest 9d ago</Tag>
            }
          </div>
        </div>
      </Card>

      {/* Ingest card */}
      <Card style={{ marginBottom: 16 }}>
        <SectionLabel>RSS feed ingest</SectionLabel>
        <div style={{ display: "flex", gap: 10 }}>
          <Input value={feedUrl} onChange={e => setFeedUrl(e.target.value)} mono style={{ flex: 1 }} />
          <Btn onClick={runIngest} disabled={ingesting} style={{ minWidth: 130, position: "relative", overflow: "hidden", borderRadius: 8 }}>
            {ingesting ? `Ingesting… ${ingestCount}` : ingestDone ? "✓ Done" : "Ingest feed"}
            {ingesting && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, height: 2,
                background: "rgba(251,247,238,0.5)",
                width: `${(ingestCount / 27) * 100}%`, transition: "width 100ms",
              }} />
            )}
          </Btn>
        </div>
      </Card>

      {/* Manual topic injection */}
      <Card style={{ marginBottom: 24 }}>
        <div
          onClick={() => setTopicOpen(o => !o)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
        >
          <SectionLabel>✎ Manual topic injection</SectionLabel>
          <span style={{ fontFamily: t.mono, fontSize: 16, color: t.sub, marginBottom: 10 }}>{topicOpen ? "−" : "+"}</span>
        </div>
        {topicOpen && (
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <Input
              value={topicText}
              onChange={e => setTopicText(e.target.value)}
              placeholder="e.g. 'why are creators leaving Substack'"
              style={{ flex: 1 }}
            />
            <Btn onClick={() => {
              if (!topicText.trim()) return;
              setTopicToast(`Queued: "${topicText}" — cross-referencing 200 signals`);
              setTopicText(""); setTopicOpen(false);
              setTimeout(() => setTopicToast(false), 2600);
            }}>Inject topic</Btn>
          </div>
        )}
      </Card>

      {/* Signals list */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontFamily: t.serif, fontSize: 22, fontStyle: "italic" }}>Latest signals</span>
            <span style={{ fontFamily: t.mono, fontSize: 11, color: t.sub }}>{visible.length} shown · 200 total</span>
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {topics.map(tp => (
              <div key={tp} onClick={() => setFilter(tp)} style={{
                fontFamily: t.mono, fontSize: 10, letterSpacing: 0.5,
                padding: "4px 10px", borderRadius: 999, cursor: "pointer",
                background: tp === filter ? t.ink : "transparent",
                color: tp === filter ? t.bg : t.sub,
                border: `1px solid ${tp === filter ? t.ink : t.line}`,
              }}>{tp.toLowerCase()}</div>
            ))}
          </div>
        </div>
        <Divider />
        {visible.map((s, i) => (
          <div key={s.id}
            onMouseEnter={() => setHovered(s.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              display: "grid", gridTemplateColumns: "28px 1fr auto auto 90px",
              gap: 16, alignItems: "center", padding: "13px 4px",
              borderBottom: `1px solid ${t.line}`,
              background: hovered === s.id ? t.chip : "transparent",
              transition: "background 100ms", cursor: "default",
            }}>
            <div style={{ fontFamily: t.mono, fontSize: 10, color: t.sub, textAlign: "right" }}>
              {String(s.id).padStart(3, "0")}
            </div>
            <div>
              <div style={{ fontSize: 14, lineHeight: 1.35 }}>{s.title}</div>
              <div style={{ fontSize: 11, fontFamily: t.mono, color: t.sub, marginTop: 3 }}>
                {s.source} · {s.date}
              </div>
            </div>
            <Tag>{s.topic}</Tag>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ fontSize: 9, color: t.sub, fontFamily: t.mono }}>heat</div>
              <div style={{ width: 48, height: 4, background: t.chip, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${s.heat}%`, height: "100%", background: t.accent }} />
              </div>
              <div style={{ fontFamily: t.mono, fontSize: 10, color: t.sub, width: 24 }}>{s.heat}</div>
            </div>
            <div style={{ opacity: hovered === s.id ? 1 : 0, transition: "opacity 100ms", display: "flex", justifyContent: "flex-end" }}>
              <Btn variant="positive" size="sm" onClick={() => promote(s)}>↗ Lead</Btn>
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: t.sub, fontFamily: t.serif, fontStyle: "italic", fontSize: 18 }}>
            No signals match this filter.
          </div>
        )}
      </Card>

      {/* Toast */}
      {topicToast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: t.ink, color: "#F5EFE4", padding: "10px 20px",
          borderRadius: 8, fontFamily: t.mono, fontSize: 12, letterSpacing: 0.3,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)", zIndex: 200,
        }}>{topicToast}</div>
      )}
    </div>
  );
}

Object.assign(window, { PageSignals });
