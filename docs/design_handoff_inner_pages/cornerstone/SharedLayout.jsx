// Shared sidebar + page shell
function Sidebar({ page, setPage, issueCount = 9 }) {
  const t = window.T;
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: "◐" },
    { id: "signals",   label: "Signals",   icon: "≈" },
    { id: "leads",     label: "Leads",     icon: "◇" },
    { id: "issues",    label: "Issues",    icon: "▤", badge: issueCount },
    { id: "outlines",  label: "Outlines",  icon: "↳" },
    { id: "brand",     label: "Brand",     icon: "✦" },
    { id: "research",  label: "Research",  icon: "⌁" },
  ];

  return (
    <aside style={{
      width: 230, flexShrink: 0,
      borderRight: `1px solid ${t.line}`,
      background: t.panel,
      display: "flex", flexDirection: "column",
      padding: "22px 18px", gap: 28,
      height: "100vh", boxSizing: "border-box", overflowY: "auto",
    }}>
      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(135deg, ${t.accent} 0%, ${t.accent2} 100%)`,
          display: "grid", placeItems: "center",
          fontFamily: t.serif, fontSize: 19, color: "#FBF7EE", fontStyle: "italic",
        }}>C</div>
        <div>
          <div style={{ fontFamily: t.serif, fontSize: 19, lineHeight: 1, fontStyle: "italic" }}>Cornerstone</div>
          <div style={{ fontSize: 10, letterSpacing: 2.5, color: t.sub, marginTop: 3, textTransform: "uppercase", fontFamily: t.mono }}>OS · Studio</div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {nav.map(({ id, label, icon, badge }) => {
          const active = page === id;
          return (
            <div key={id} onClick={() => setPage(id)} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 6, cursor: "pointer",
              background: active ? t.chip : "transparent",
              color: active ? t.ink : t.sub,
              fontFamily: t.sans, fontSize: 14,
              fontWeight: active ? 500 : 400,
              transition: "background 120ms, color 120ms",
            }}>
              <span style={{ width: 16, textAlign: "center", opacity: 0.75, fontSize: 13 }}>{icon}</span>
              <span style={{ flex: 1 }}>{label}</span>
              {badge && <span style={{ fontFamily: t.mono, fontSize: 11, color: t.sub }}>{badge}</span>}
            </div>
          );
        })}

        {/* ACE — special treatment */}
        <div onClick={() => setPage("ace")} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", borderRadius: 6, cursor: "pointer",
          background: page === "ace" ? t.ink : "transparent",
          color: page === "ace" ? "#F5EFE4" : t.sub,
          fontFamily: t.sans, fontSize: 14, fontWeight: 500,
          marginTop: 8, transition: "background 120ms, color 120ms",
          position: "relative",
        }}>
          <span style={{ width: 16, textAlign: "center", fontSize: 13 }}>⚙</span>
          <span style={{ flex: 1 }}>ACE</span>
          {/* Pulse dot */}
          <span style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: page === "ace" ? "#E8A24A" : t.accent,
              display: "block",
            }} />
          </span>
        </div>
      </nav>

      {/* Footer summary */}
      <div style={{ marginTop: "auto", fontFamily: t.mono, fontSize: 11, color: t.sub, lineHeight: 1.7 }}>
        <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 5 }}>Today</div>
        <div>27 signals ingested</div>
        <div>2 leads to approve</div>
        <div>Issue 41 — 62%</div>
      </div>

      {/* Avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: "50%",
          background: t.accent, display: "grid", placeItems: "center",
          color: "#FBF7EE", fontWeight: 700, fontSize: 12, fontFamily: t.sans,
        }}>N</div>
        <div style={{ fontFamily: t.sans, fontSize: 12, color: t.sub }}>My workspace</div>
      </div>
    </aside>
  );
}

function PageShell({ children, page, setPage }) {
  const t = window.T;
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", background: t.bg, fontFamily: t.sans, color: t.ink }}>
      <Sidebar page={page} setPage={setPage} />
      <main style={{ flex: 1, overflowY: "auto", padding: "36px 48px 80px" }}>
        {children}
      </main>
    </div>
  );
}

Object.assign(window, { Sidebar, PageShell });
