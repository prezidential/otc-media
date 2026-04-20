// Page: ACE — Autonomous Content Engine (v2)
// Redesigned UX: ring balance chart, ignition run panel, timeline log.

const AD = {
  bg:      "#0F0C08",
  panel:   "#181410",
  panelHi: "#211B14",
  border:  "#2C2318",
  ink:     "#F0E6CF",
  sub:     "#7A6A52",
  amber:   "#E8A24A",
  amberLo: "#E8A24A28",
  green:   "#6FAE7F",
  greenLo: "#6FAE7F20",
  red:     "#C0442A",
  redLo:   "#C0442A20",
  blue:    "#6A9ECA",
  blueLo:  "#6A9ECA20",
  mono:    "'JetBrains Mono', monospace",
  sans:    "'Geist', system-ui, sans-serif",
  serif:   "'Instrument Serif', Georgia, serif",
};

// ── Ring Balance SVG ─────────────────────────────────────────────────────
function RingChart({ rings, hoveredTier, setHoveredTier, animating }) {
  const cx = 190, cy = 190, size = 380;
  const config = {
    inner:  { r: 62,  sw: 30, color: AD.amber,  dimColor: "#2C2318" },
    middle: { r: 104, sw: 26, color: "#C87B3C",  dimColor: "#2A1E10" },
    outer:  { r: 144, sw: 22, color: AD.green,   dimColor: "#1A2820" },
  };

  const arc = (tier, pct) => {
    const { r } = config[tier];
    const circ = 2 * Math.PI * r;
    const fill = Math.max(0, Math.min(1, pct)) * circ;
    return { dasharray: `${fill} ${circ}`, dashoffset: circ * 0.25 };
  };

  const overallPct = Math.round(
    rings.reduce((s, r) => s + (r.target > 0 ? r.current / r.target : 0), 0)
    / rings.length * 100
  );

  const statusText = overallPct === 0 ? "EMPTY" : overallPct < 40 ? "NEEDS WORK" : overallPct < 80 ? "BUILDING" : "BALANCED";
  const statusColor = overallPct === 0 ? AD.sub : overallPct < 40 ? AD.amber : overallPct < 80 ? "#C87B3C" : AD.green;

  const tierTotals = {
    inner:  { current: rings.filter(r=>r.ring==="inner").reduce((s,r)=>s+r.current,0), target: rings.filter(r=>r.ring==="inner").reduce((s,r)=>s+r.target,0) },
    middle: { current: rings.filter(r=>r.ring==="middle").reduce((s,r)=>s+r.current,0), target: rings.filter(r=>r.ring==="middle").reduce((s,r)=>s+r.target,0) },
    outer:  { current: rings.filter(r=>r.ring==="outer").reduce((s,r)=>s+r.current,0), target: rings.filter(r=>r.ring==="outer").reduce((s,r)=>s+r.target,0) },
  };

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <defs>
          <filter id="aceGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
          <filter id="aceGlowSoft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Outer ambient glow ring */}
        <circle cx={cx} cy={cy} r={170} fill="none" stroke={AD.amber} strokeWidth={1} opacity={0.06}/>
        <circle cx={cx} cy={cy} r={178} fill="none" stroke={AD.amber} strokeWidth={0.5} opacity={0.04}/>

        {["outer","middle","inner"].map(tier => {
          const { r, sw, color, dimColor } = config[tier];
          const totals = tierTotals[tier];
          const pct = totals.target > 0 ? totals.current / totals.target : 0;
          const a = arc(tier, pct);
          const isHov = hoveredTier === tier;
          return (
            <g key={tier}
              onMouseEnter={() => setHoveredTier(tier)}
              onMouseLeave={() => setHoveredTier(null)}
              style={{ cursor: "pointer" }}
            >
              {/* Background track */}
              <circle cx={cx} cy={cy} r={r} fill="none"
                stroke={dimColor} strokeWidth={sw}/>
              {/* Fill arc */}
              {pct > 0 && (
                <circle cx={cx} cy={cy} r={r} fill="none"
                  stroke={isHov ? "#fff" : color}
                  strokeWidth={sw}
                  strokeDasharray={a.dasharray}
                  strokeDashoffset={a.dashoffset}
                  strokeLinecap="round"
                  opacity={isHov ? 0.9 : 1}
                  filter={isHov ? "url(#aceGlow)" : "url(#aceGlowSoft)"}
                  style={{ transition: animating ? "stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)" : "none" }}
                />
              )}
              {/* Hover highlight */}
              {isHov && (
                <circle cx={cx} cy={cy} r={r} fill="none"
                  stroke={color} strokeWidth={sw + 6} opacity={0.08}/>
              )}
            </g>
          );
        })}

        {/* Center */}
        <circle cx={cx} cy={cy} r={38} fill={AD.panel}/>
        <circle cx={cx} cy={cy} r={38} fill="none" stroke={AD.border} strokeWidth={1}/>
        <text x={cx} y={cy - 6} textAnchor="middle"
          fontFamily={AD.mono} fontSize={20} fontWeight={700}
          fill={statusColor}>{overallPct}%</text>
        <text x={cx} y={cy + 12} textAnchor="middle"
          fontFamily={AD.mono} fontSize={8} letterSpacing={2}
          fill={AD.sub}>{statusText}</text>
      </svg>

      {/* Tier tooltip on hover */}
      {hoveredTier && (() => {
        const totals = tierTotals[hoveredTier];
        const lanes = rings.filter(r => r.ring === hoveredTier);
        const positions = { inner: { top: "38%", left: "calc(100% + 16px)" }, middle: { top: "20%", left: "calc(100% + 16px)" }, outer: { top: "6%", left: "calc(100% + 16px)" } };
        return (
          <div style={{
            position: "absolute", ...positions[hoveredTier],
            background: AD.panelHi, border: `1px solid ${AD.border}`,
            borderRadius: 10, padding: "12px 16px", minWidth: 180,
            pointerEvents: "none", zIndex: 10,
          }}>
            <div style={{ fontFamily: AD.mono, fontSize: 9, letterSpacing: 2, color: AD.sub, textTransform: "uppercase", marginBottom: 8 }}>
              {hoveredTier} ring
            </div>
            {lanes.map(l => (
              <div key={l.name} style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                <span style={{ fontSize: 12, color: AD.ink }}>{l.name}</span>
                <span style={{ fontFamily: AD.mono, fontSize: 11, color: l.current > 0 ? AD.green : AD.sub }}>
                  {l.current}/{l.target}
                </span>
              </div>
            ))}
            <div style={{ marginTop: 8, borderTop: `1px solid ${AD.border}`, paddingTop: 8, display: "flex", justifyContent: "space-between", fontFamily: AD.mono, fontSize: 10 }}>
              <span style={{ color: AD.sub }}>total</span>
              <span style={{ color: AD.ink }}>{totals.current} / {totals.target}</span>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Main ACE page ─────────────────────────────────────────────────────────
function PageACE() {
  const [enabled, setEnabled] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [runStage, setRunStage] = React.useState(null); // null | "checking" | "running" | "done" | "skipped"
  const [hoveredTier, setHoveredTier] = React.useState(null);
  const [animating, setAnimating] = React.useState(false);
  const [log, setLog] = React.useState([
    { ts: "9d ago",   kind: "warn",  text: "Stale guard tripped — last ingest 9d ago. Run skipped." },
    { ts: "9d ago",   kind: "info",  text: "ACE_ENABLED flag not set. Cron skipped." },
    { ts: "14d ago",  kind: "ok",    text: "Pipeline complete — Issue draft written, 4,100 words." },
    { ts: "14d ago",  kind: "ok",    text: "Ingest completed: +31 inserted, 198 skipped." },
    { ts: "21d ago",  kind: "error", text: "Directive timeout after 60s — no leads written." },
  ]);

  const [lanes, setLanes] = React.useState([
    { name: "IAM Core",                    ring: "inner",  current: 2, target: 8 },
    { name: "AI × Identity",               ring: "middle", current: 1, target: 4 },
    { name: "Enterprise Program Building", ring: "middle", current: 0, target: 2 },
    { name: "Practitioner to Leader",      ring: "middle", current: 1, target: 2 },
    { name: "B2B Creator",                 ring: "outer",  current: 0, target: 2 },
  ]);

  const addLog = (kind, text) => {
    const now = new Date();
    const ts = `${now.getHours()}:${String(now.getMinutes()).padStart(2,"0")}`;
    setLog(l => [{ ts, kind, text }, ...l]);
  };

  const runACE = (force = false) => {
    if (running) return;
    setRunning(true);

    if (!enabled && !force) {
      setRunStage("checking");
      setTimeout(() => {
        addLog("warn", "ACE_ENABLED is false — run skipped. Enable ACE to proceed.");
        setRunStage("skipped");
        setTimeout(() => { setRunning(false); setRunStage(null); }, 1800);
      }, 1200);
      return;
    }

    setRunStage("running");
    const steps = [
      ["info",  "Fetching signals from 14 active sources…"],
      ["info",  "Running 5 research directives…"],
      ["info",  "Clustering findings by lane affinity…"],
      ["ok",    "3 lead candidates surfaced — writing editorial brief…"],
      ["ok",    "Draft queued for Telegram approval."],
    ];
    steps.forEach(([kind, text], i) => {
      setTimeout(() => addLog(kind, text), i * 700);
    });
    setTimeout(() => {
      setRunStage("done");
      setAnimating(true);
      setLanes(prev => prev.map(l => ({
        ...l,
        current: Math.min(l.target, l.current + (l.ring === "inner" ? 2 : l.ring === "middle" ? 1 : 0)),
      })));
      setTimeout(() => setAnimating(false), 2000);
      setTimeout(() => { setRunning(false); setRunStage(null); }, 2200);
    }, steps.length * 700 + 400);
  };

  const tierColors = { inner: AD.amber, middle: "#C87B3C", outer: AD.green };
  const stageMsg = {
    checking: "Checking guards…",
    running:  "Pipeline active",
    done:     "Run complete",
    skipped:  "Skipped — not enabled",
  };

  const overallHealth = Math.round(
    lanes.reduce((s, l) => s + (l.target > 0 ? l.current / l.target : 0), 0) / lanes.length * 100
  );

  return (
    <div style={{
      position: "absolute", inset: 0, background: AD.bg,
      color: AD.ink, fontFamily: AD.sans,
      overflowY: "auto", padding: "32px 44px 80px",
    }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <div>
          <div style={{ fontFamily: AD.mono, fontSize: 10, letterSpacing: 3, color: AD.sub, textTransform: "uppercase", marginBottom: 8 }}>
            Cornerstone OS · Engine Room
          </div>
          <h1 style={{ fontFamily: AD.serif, fontStyle: "italic", fontWeight: 400, fontSize: 48, lineHeight: 1.05, margin: 0 }}>
            Autonomous<br/><span style={{ color: AD.amber }}>Content Engine</span>
          </h1>
          <div style={{ fontSize: 13, color: AD.sub, marginTop: 8, maxWidth: 400, lineHeight: 1.55 }}>
            Orchestrates your full pipeline — research directives, lead generation, issue drafting, and Telegram approvals.
          </div>
        </div>

        {/* Status chip */}
        <div style={{
          background: AD.panel, border: `1px solid ${enabled ? AD.amber + "66" : AD.border}`,
          borderRadius: 16, padding: "18px 24px", textAlign: "center",
          boxShadow: enabled ? `0 0 40px ${AD.amber}22` : "none",
          transition: "box-shadow 400ms, border-color 400ms", minWidth: 160,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: running ? AD.amber : enabled ? AD.green : AD.sub,
              boxShadow: running ? `0 0 8px ${AD.amber}` : enabled ? `0 0 8px ${AD.green}` : "none",
              animation: running ? "acePulse 1s ease-in-out infinite" : "none",
            }}/>
            <div style={{ fontFamily: AD.mono, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
              color: running ? AD.amber : enabled ? AD.green : AD.sub }}>
              {running ? (stageMsg[runStage] || "Running") : enabled ? "Live" : "Standby"}
            </div>
          </div>
          {/* Toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            <span style={{ fontSize: 11, color: AD.sub }}>ACE_ENABLED</span>
            <div onClick={() => setEnabled(e => !e)} style={{
              width: 36, height: 20, borderRadius: 999, cursor: "pointer",
              background: enabled ? AD.amber : AD.border,
              position: "relative", transition: "background 200ms",
            }}>
              <div style={{
                position: "absolute", top: 2, left: enabled ? 18 : 2,
                width: 16, height: 16, borderRadius: 999,
                background: enabled ? AD.bg : AD.sub,
                transition: "left 200ms",
              }}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main grid: ring + controls ── */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 28, marginBottom: 24, alignItems: "start" }}>
        {/* Ring chart */}
        <div style={{
          background: AD.panel, border: `1px solid ${AD.border}`,
          borderRadius: 20, padding: "28px 32px 20px",
          display: "flex", flexDirection: "column", alignItems: "center",
        }}>
          <div style={{ fontFamily: AD.mono, fontSize: 10, letterSpacing: 2, color: AD.sub, textTransform: "uppercase", marginBottom: 16 }}>
            Content lane balance · 30 days
          </div>

          <RingChart rings={lanes} hoveredTier={hoveredTier} setHoveredTier={setHoveredTier} animating={animating}/>

          {/* Legend */}
          <div style={{ display: "flex", gap: 20, marginTop: 16 }}>
            {["inner","middle","outer"].map(tier => {
              const totals = { current: lanes.filter(l=>l.ring===tier).reduce((s,l)=>s+l.current,0), target: lanes.filter(l=>l.ring===tier).reduce((s,l)=>s+l.target,0) };
              const pct = totals.target > 0 ? Math.round(totals.current/totals.target*100) : 0;
              return (
                <div key={tier}
                  onMouseEnter={() => setHoveredTier(tier)}
                  onMouseLeave={() => setHoveredTier(null)}
                  style={{ textAlign: "center", cursor: "pointer", opacity: hoveredTier && hoveredTier !== tier ? 0.4 : 1, transition: "opacity 150ms" }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: tierColors[tier], margin: "0 auto 4px" }}/>
                  <div style={{ fontFamily: AD.mono, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", color: AD.sub }}>{tier}</div>
                  <div style={{ fontFamily: AD.mono, fontSize: 13, fontWeight: 700, color: tierColors[tier], marginTop: 2 }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Controls + stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Run panel */}
          <div style={{
            background: AD.panel, border: `1px solid ${running ? AD.amber + "44" : AD.border}`,
            borderRadius: 16, padding: "24px", overflow: "hidden",
            position: "relative", transition: "border-color 300ms",
          }}>
            {running && (
              <div style={{
                position: "absolute", top: 0, left: 0, right: 0, height: 2,
                background: `linear-gradient(90deg, transparent 0%, ${AD.amber} 50%, transparent 100%)`,
                backgroundSize: "200% 100%",
                animation: "aceSlide 1.4s linear infinite",
              }}/>
            )}
            <div style={{ fontFamily: AD.mono, fontSize: 10, letterSpacing: 2, color: AD.sub, textTransform: "uppercase", marginBottom: 16 }}>
              Pipeline trigger
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
              <button onClick={() => runACE(false)} disabled={running} style={{
                flex: 1, padding: "14px 20px",
                fontFamily: AD.sans, fontSize: 14, fontWeight: 600,
                background: running ? AD.panelHi : enabled ? AD.amber : AD.panelHi,
                color: running ? AD.sub : enabled ? AD.bg : AD.sub,
                border: `1px solid ${running ? AD.border : enabled ? AD.amber : AD.border}`,
                borderRadius: 10, cursor: running ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                transition: "all 200ms",
              }}>
                {running ? (
                  <>
                    <span style={{ width: 14, height: 14, border: `2px solid ${AD.sub}55`, borderTopColor: AD.amber, borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "block" }}/>
                    {stageMsg[runStage] || "Running…"}
                  </>
                ) : "▶  Run ACE"}
              </button>
              <button onClick={() => runACE(true)} disabled={running} style={{
                padding: "14px 16px",
                fontFamily: AD.sans, fontSize: 12, fontWeight: 500,
                background: "transparent", color: AD.sub,
                border: `1px solid ${AD.border}`, borderRadius: 10,
                cursor: running ? "default" : "pointer",
                opacity: running ? 0.4 : 1,
              }}>Force</button>
            </div>

            {/* Quick stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: AD.border, borderRadius: 8, overflow: "hidden" }}>
              {[
                { label: "Last run", value: "9d ago", color: AD.amber },
                { label: "Total drafts", value: "8", color: AD.ink },
                { label: "Health", value: `${overallHealth}%`, color: overallHealth > 60 ? AD.green : AD.amber },
              ].map(s => (
                <div key={s.label} style={{ background: AD.panelHi, padding: "12px 14px" }}>
                  <div style={{ fontFamily: AD.mono, fontSize: 9, letterSpacing: 1.5, color: AD.sub, textTransform: "uppercase" }}>{s.label}</div>
                  <div style={{ fontFamily: AD.mono, fontSize: 18, fontWeight: 700, color: s.color, marginTop: 4 }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Lane list */}
          <div style={{ background: AD.panel, border: `1px solid ${AD.border}`, borderRadius: 16, padding: "20px 22px" }}>
            <div style={{ fontFamily: AD.mono, fontSize: 10, letterSpacing: 2, color: AD.sub, textTransform: "uppercase", marginBottom: 14 }}>
              Lanes
            </div>
            {lanes.map(l => {
              const pct = l.target > 0 ? l.current / l.target : 0;
              const col = tierColors[l.ring];
              return (
                <div key={l.name} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                    <div style={{ fontSize: 12, color: AD.ink }}>{l.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{
                        fontFamily: AD.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
                        color: col, background: col + "20", padding: "2px 6px", borderRadius: 3,
                      }}>{l.ring}</div>
                      <div style={{ fontFamily: AD.mono, fontSize: 11, color: l.current > 0 ? AD.green : AD.sub }}>
                        {l.current}<span style={{ opacity: 0.4 }}>/{l.target}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ height: 4, background: AD.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", width: `${pct * 100}%`,
                      background: pct >= 1 ? AD.green : col,
                      borderRadius: 2, transition: animating ? "width 1.4s cubic-bezier(0.4,0,0.2,1)" : "none",
                    }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Bottom: log + approval queue ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 20 }}>
        {/* Activity timeline */}
        <div style={{ background: AD.panel, border: `1px solid ${AD.border}`, borderRadius: 16, padding: "20px 22px" }}>
          <div style={{ fontFamily: AD.mono, fontSize: 10, letterSpacing: 2, color: AD.sub, textTransform: "uppercase", marginBottom: 18 }}>
            Activity log
          </div>
          <div style={{ position: "relative" }}>
            {/* Vertical line */}
            <div style={{ position: "absolute", left: 6, top: 8, bottom: 8, width: 1, background: AD.border }}/>
            {log.slice(0, 7).map((entry, i) => {
              const dotColor = entry.kind === "ok" ? AD.green : entry.kind === "error" ? AD.red : entry.kind === "warn" ? AD.amber : AD.blue;
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 14, marginBottom: 16, position: "relative" }}>
                  <div style={{
                    width: 13, height: 13, borderRadius: "50%",
                    background: dotColor, border: `2px solid ${AD.bg}`,
                    boxShadow: `0 0 6px ${dotColor}88`,
                    marginTop: 2, zIndex: 1, flexShrink: 0,
                  }}/>
                  <div>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", marginBottom: 2 }}>
                      <div style={{ fontFamily: AD.mono, fontSize: 10, color: dotColor, letterSpacing: 0.5, textTransform: "uppercase" }}>{entry.kind}</div>
                      <div style={{ fontFamily: AD.mono, fontSize: 10, color: AD.sub }}>{entry.ts}</div>
                    </div>
                    <div style={{ fontSize: 13, color: AD.ink, lineHeight: 1.45 }}>{entry.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Approval queue */}
        <div style={{ background: AD.panel, border: `1px solid ${AD.border}`, borderRadius: 16, padding: "20px 22px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div style={{ fontFamily: AD.mono, fontSize: 10, letterSpacing: 2, color: AD.sub, textTransform: "uppercase" }}>
              Telegram approvals
            </div>
            <div style={{ fontFamily: AD.mono, fontSize: 10, color: AD.sub }}>0 pending</div>
          </div>
          {/* Empty state */}
          <div style={{
            flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            padding: "40px 20px", gap: 12,
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%",
              border: `1px dashed ${AD.border}`,
              display: "grid", placeItems: "center",
              fontSize: 22, color: AD.sub, opacity: 0.5,
            }}>✓</div>
            <div style={{ fontFamily: AD.serif, fontStyle: "italic", fontSize: 18, color: AD.sub, textAlign: "center" }}>
              All clear — nothing waiting
            </div>
            <div style={{ fontFamily: AD.mono, fontSize: 11, color: AD.sub, textAlign: "center", lineHeight: 1.6, maxWidth: 220, opacity: 0.7 }}>
              When a draft is ready, it'll appear here for Telegram sign-off before publishing.
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes acePulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 8px currentColor; }
          50% { opacity: 0.5; box-shadow: 0 0 3px currentColor; }
        }
        @keyframes aceSlide {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

Object.assign(window, { PageACE });
