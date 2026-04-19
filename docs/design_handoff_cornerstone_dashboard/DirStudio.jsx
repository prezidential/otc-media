// Direction 1 — "STUDIO"
// Warm editorial. Cream paper, serif display, calm + focused.
// For creators who want their tool to feel like a quiet writing studio.

const studioTheme = {
  name: "Studio",
  bg: "#F5EFE4",          // warm cream
  panel: "#FBF7EE",
  ink: "#1F1A14",
  sub: "#6B5F4E",
  line: "#E4D9C2",
  accent: "#C8571E",      // burnt orange
  accent2: "#3F6B45",     // forest
  chip: "#EBDFC5",
  shadow: "0 1px 0 rgba(30,20,10,0.04), 0 14px 30px -18px rgba(60,40,10,0.18)",
  serif: "'Instrument Serif', 'Cormorant Garamond', Georgia, serif",
  sans: "'Geist', 'Söhne', -apple-system, system-ui, sans-serif",
  mono: "'JetBrains Mono', 'IBM Plex Mono', monospace",
};

function Studio({ dark }) {
  const t = dark ? {
    ...studioTheme,
    bg: "#1A1612",
    panel: "#221D16",
    ink: "#F2E9D7",
    sub: "#9C8E78",
    line: "#322B22",
    chip: "#2A2319",
    accent: "#E07A3C",
    accent2: "#8FB58A",
    shadow: "0 1px 0 rgba(0,0,0,0.3), 0 14px 30px -18px rgba(0,0,0,0.6)",
  } : studioTheme;

  const [feedUrl, setFeedUrl] = React.useState("https://www.darkreading.com/rss.xml");
  const [ingesting, setIngesting] = React.useState(false);
  const [ingestCount, setIngestCount] = React.useState(0);
  const [topic, setTopic] = React.useState("AI");
  const [hovered, setHovered] = React.useState(null);

  const runIngest = () => {
    if (ingesting) return;
    setIngesting(true); setIngestCount(0);
    let n = 0;
    const iv = setInterval(() => {
      n += Math.floor(Math.random() * 3) + 1;
      if (n >= 27) { n = 27; clearInterval(iv); setTimeout(() => setIngesting(false), 600); }
      setIngestCount(n);
    }, 90);
  };

  const topics = ["All", "AI", "Biotech", "Robotics", "Climate", "Media", "Consumer"];
  const filtered = topic === "All" ? SIGNALS : SIGNALS.filter(s => s.topic === topic);

  return (
    <div style={{
      width: "100%", height: "100%",
      background: t.bg, color: t.ink,
      fontFamily: t.sans, display: "flex", overflow: "hidden",
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 230, borderRight: `1px solid ${t.line}`,
        padding: "22px 18px", display: "flex", flexDirection: "column",
        gap: 28, background: t.panel,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8,
            background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accent2} 100%)`,
            display: "grid", placeItems: "center",
            fontFamily: t.serif, fontSize: 19, color: "#FBF7EE",
            fontStyle: "italic", fontWeight: 500,
          }}>C</div>
          <div>
            <div style={{ fontFamily: t.serif, fontSize: 19, lineHeight: 1, fontStyle: "italic" }}>Cornerstone</div>
            <div style={{ fontSize: 10, letterSpacing: 2.5, color: t.sub, marginTop: 3, textTransform: "uppercase" }}>OS · Studio</div>
          </div>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {[
            ["◐", "Dashboard", true],
            ["≈", "Signals"],
            ["◇", "Leads", false, "12"],
            ["▤", "Issues", false, "3"],
            ["↳", "Outlines"],
            ["✦", "Brand"],
            ["⌁", "Research"],
          ].map(([ic, n, active, badge]) => (
            <div key={n} style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "9px 12px", borderRadius: 6,
              fontSize: 14, color: active ? t.ink : t.sub,
              background: active ? t.chip : "transparent",
              fontWeight: active ? 500 : 400, cursor: "pointer",
            }}>
              <span style={{ width: 14, textAlign: "center", opacity: 0.75 }}>{ic}</span>
              <span style={{ flex: 1 }}>{n}</span>
              {badge && <span style={{
                fontSize: 11, color: t.sub, fontFamily: t.mono,
              }}>{badge}</span>}
            </div>
          ))}
        </nav>

        <div style={{ marginTop: "auto", fontSize: 11, color: t.sub, lineHeight: 1.6 }}>
          <div style={{ fontFamily: t.mono, letterSpacing: 1.2, textTransform: "uppercase", fontSize: 9, marginBottom: 6 }}>Today</div>
          <div>27 signals ingested</div>
          <div>2 leads to approve</div>
          <div>1 issue drafting</div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", padding: "28px 44px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, color: t.sub, fontFamily: t.mono, textTransform: "uppercase", marginBottom: 6 }}>
              Thursday · April 18
            </div>
            <h1 style={{
              fontFamily: t.serif, fontWeight: 400, margin: 0,
              fontSize: 52, lineHeight: 1, letterSpacing: -0.5,
            }}>
              Good morning. <span style={{ fontStyle: "italic", color: t.accent }}>You have ideas waiting.</span>
            </h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={{
              fontFamily: t.sans, fontSize: 13, padding: "9px 14px",
              background: "transparent", color: t.ink,
              border: `1px solid ${t.line}`, borderRadius: 999, cursor: "pointer",
            }}>⌘K  Search</button>
            <button style={{
              fontFamily: t.sans, fontSize: 13, padding: "9px 16px",
              background: t.ink, color: t.bg, border: "none",
              borderRadius: 999, cursor: "pointer", fontWeight: 500,
            }}>+ New issue</button>
          </div>
        </div>

        {/* Pipeline — flow as horizontal rail */}
        <div style={{
          background: t.panel, border: `1px solid ${t.line}`,
          borderRadius: 14, padding: "22px 26px", marginBottom: 24,
          boxShadow: t.shadow,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
            <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: t.sub }}>
              End-to-end flow
            </div>
            <div style={{ fontSize: 12, color: t.sub }}>
              Last ingest <span style={{ color: t.ink }}>8 days ago</span> · <span style={{ color: t.accent }}>+27 fresh</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
            {PIPELINE.map((p, i) => (
              <React.Fragment key={p.key}>
                <div style={{ flex: 1, position: "relative" }}>
                  <div style={{
                    fontFamily: t.serif, fontSize: 44, lineHeight: 1,
                    fontStyle: "italic", color: i === 1 ? t.accent : t.ink,
                  }}>{p.count}</div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 500 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: t.sub, marginTop: 2 }}>{p.sub}</div>
                  {i === 1 && (
                    <div style={{
                      position: "absolute", top: -6, right: 16,
                      fontFamily: t.mono, fontSize: 9, letterSpacing: 1.5,
                      background: t.accent, color: "#FBF7EE",
                      padding: "3px 7px", borderRadius: 3,
                    }}>NEEDS YOU</div>
                  )}
                </div>
                {i < PIPELINE.length - 1 && (
                  <div style={{
                    width: 40, display: "flex", alignItems: "center",
                    justifyContent: "center", color: t.sub, fontSize: 18,
                  }}>→</div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* 2-col */}
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 20, marginBottom: 24 }}>
          {/* Ingest */}
          <div style={{
            background: t.panel, border: `1px solid ${t.line}`,
            borderRadius: 14, padding: "20px 22px", boxShadow: t.shadow,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontFamily: t.serif, fontSize: 22, fontStyle: "italic" }}>Ingest a feed</div>
              <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 1.5, color: t.sub, textTransform: "uppercase" }}>
                RSS · ATOM · Sitemap
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={feedUrl} onChange={e => setFeedUrl(e.target.value)}
                style={{
                  flex: 1, padding: "11px 14px", fontFamily: t.mono, fontSize: 13,
                  background: t.bg, color: t.ink, border: `1px solid ${t.line}`,
                  borderRadius: 8, outline: "none",
                }}
              />
              <button onClick={runIngest} disabled={ingesting} style={{
                padding: "0 20px", fontFamily: t.sans, fontWeight: 500, fontSize: 13,
                background: ingesting ? t.chip : t.accent,
                color: ingesting ? t.sub : "#FBF7EE",
                border: "none", borderRadius: 8,
                cursor: ingesting ? "default" : "pointer",
                position: "relative", overflow: "hidden", minWidth: 120,
              }}>
                {ingesting ? `Ingesting… ${ingestCount}` : "Ingest feed"}
                {ingesting && (
                  <div style={{
                    position: "absolute", bottom: 0, left: 0, height: 2,
                    background: "rgba(251,247,238,0.6)",
                    width: `${(ingestCount / 27) * 100}%`, transition: "width 120ms",
                  }} />
                )}
              </button>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              {["darkreading", "mit tech review", "the verge", "bloomberg", "stratechery"].map(f => (
                <div key={f} style={{
                  fontSize: 11, fontFamily: t.mono, color: t.sub,
                  padding: "4px 9px", background: t.chip, borderRadius: 999,
                }}>⟲ {f}</div>
              ))}
            </div>
          </div>

          {/* Today's nudges */}
          <div style={{
            background: `linear-gradient(160deg, ${t.accent}15 0%, transparent 60%), ${t.panel}`,
            border: `1px solid ${t.line}`, borderRadius: 14, padding: "20px 22px",
            boxShadow: t.shadow,
          }}>
            <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 2, color: t.sub, textTransform: "uppercase", marginBottom: 10 }}>
              The cornerstone
            </div>
            <div style={{ fontFamily: t.serif, fontSize: 26, lineHeight: 1.15, marginBottom: 14 }}>
              Two leads have been waiting <span style={{ fontStyle: "italic", color: t.accent }}>four days</span>. Approve them to keep Issue 41 on pace.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{
                fontFamily: t.sans, fontSize: 12, padding: "7px 13px",
                background: t.ink, color: t.bg, border: "none", borderRadius: 999, cursor: "pointer",
              }}>Review leads →</button>
              <button style={{
                fontFamily: t.sans, fontSize: 12, padding: "7px 13px",
                background: "transparent", color: t.ink, border: `1px solid ${t.line}`,
                borderRadius: 999, cursor: "pointer",
              }}>Snooze</button>
            </div>
          </div>
        </div>

        {/* Signals list */}
        <div style={{
          background: t.panel, border: `1px solid ${t.line}`,
          borderRadius: 14, padding: "20px 22px", boxShadow: t.shadow,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <div style={{ fontFamily: t.serif, fontSize: 24, fontStyle: "italic" }}>Latest signals</div>
              <div style={{ fontFamily: t.mono, fontSize: 11, color: t.sub }}>{filtered.length} of 200</div>
            </div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {topics.map(tp => (
                <div key={tp} onClick={() => setTopic(tp)} style={{
                  fontSize: 11, fontFamily: t.mono, letterSpacing: 0.5,
                  padding: "5px 10px", borderRadius: 999, cursor: "pointer",
                  background: tp === topic ? t.ink : "transparent",
                  color: tp === topic ? t.bg : t.sub,
                  border: `1px solid ${tp === topic ? t.ink : t.line}`,
                }}>{tp.toLowerCase()}</div>
              ))}
            </div>
          </div>
          <div>
            {filtered.map((s, i) => (
              <div key={s.id}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  display: "grid", gridTemplateColumns: "32px 1fr auto auto 80px",
                  gap: 16, alignItems: "center",
                  padding: "14px 4px",
                  borderTop: i === 0 ? `1px solid ${t.line}` : "none",
                  borderBottom: `1px solid ${t.line}`,
                  position: "relative", cursor: "pointer",
                  background: hovered === s.id ? t.chip : "transparent",
                  transition: "background 120ms",
                }}
              >
                <div style={{ fontFamily: t.mono, fontSize: 11, color: t.sub, textAlign: "right" }}>
                  {String(s.id).padStart(3, "0")}
                </div>
                <div>
                  <div style={{ fontSize: 14, lineHeight: 1.35, color: t.ink }}>{s.title}</div>
                  <div style={{ fontSize: 11, fontFamily: t.mono, color: t.sub, marginTop: 3 }}>
                    {s.source.toLowerCase()} · {s.date}
                  </div>
                </div>
                <div style={{
                  fontSize: 10, fontFamily: t.mono, letterSpacing: 1, textTransform: "uppercase",
                  padding: "3px 8px", background: t.chip, color: t.sub, borderRadius: 3,
                }}>{s.topic}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 10, color: t.sub, fontFamily: t.mono }}>heat</div>
                  <div style={{ width: 50, height: 4, background: t.chip, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${s.heat}%`, height: "100%", background: t.accent }} />
                  </div>
                </div>
                <div style={{ opacity: hovered === s.id ? 1 : 0, transition: "opacity 120ms", textAlign: "right" }}>
                  <button style={{
                    fontFamily: t.sans, fontSize: 11, padding: "4px 10px",
                    background: t.accent2, color: "#FBF7EE", border: "none",
                    borderRadius: 999, cursor: "pointer", fontWeight: 500,
                  }}>→ Lead</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

Object.assign(window, { Studio });
