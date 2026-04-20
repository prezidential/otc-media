// Page: Leads
function PageLeads({ setPage }) {
  const t = window.T;
  const [tab, setTab] = React.useState("pending");
  const [brand, setBrand] = React.useState("Identity Jedi Newsletter");
  const [generating, setGenerating] = React.useState(false);
  const [toast, setToast] = React.useState(null);

  const PENDING = [
    { id: "L-812", title: "Open-source LLMs hit a pricing floor", angle: "Contrarian: the race to zero is already over", signals: 7, due: "Thu", age: "4d" },
    { id: "L-809", title: "Why newsrooms are hiring 'vibe engineers'", angle: "Profile + trend piece", signals: 4, due: "Fri", age: "4d" },
    { id: "L-803", title: "Robots fold laundry — but who buys one?", angle: "Market-size explainer", signals: 3, due: "Next wk", age: "2d" },
  ];
  const APPROVED = [
    { id: "L-799", title: "The agent economy arrives in enterprise IT", angle: "Feature · long-form", signals: 9, due: "Published", age: "8d" },
    { id: "L-795", title: "Static security fails against dynamic AI", angle: "Technical deep-dive", signals: 6, due: "Published", age: "10d" },
  ];

  const [pendingList, setPendingList] = React.useState(PENDING);
  const [approvedList, setApprovedList] = React.useState(APPROVED);

  const approve = (lead) => {
    setPendingList(p => p.filter(l => l.id !== lead.id));
    setApprovedList(a => [{ ...lead, due: "Approved" }, ...a]);
    setToast(`✓ ${lead.id} approved`);
    setTimeout(() => setToast(null), 2000);
  };
  const pass = (lead) => {
    setPendingList(p => p.filter(l => l.id !== lead.id));
    setToast(`${lead.id} passed`);
    setTimeout(() => setToast(null), 2000);
  };

  const runGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      setToast("Generated 3 new leads — review below");
      setTimeout(() => setToast(null), 2400);
    }, 1800);
  };

  const tabs = [
    { id: "pending", label: "Pending Review", count: pendingList.length },
    { id: "approved", label: "Approved", count: approvedList.length },
    { id: "drafted", label: "Drafted", count: 0 },
  ];

  const LeadCard = ({ lead, actions }) => (
    <div style={{
      padding: "18px 0", borderBottom: `1px solid ${t.line}`,
      display: "grid", gridTemplateColumns: "auto 1fr auto",
      gap: 16, alignItems: "center",
    }}>
      <div style={{
        fontFamily: t.mono, fontSize: 10, letterSpacing: 1,
        color: t.accent, background: `${t.accent}18`,
        padding: "4px 8px", borderRadius: 4, fontWeight: 600,
      }}>{lead.id}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{lead.title}</div>
        <div style={{ fontSize: 12, color: t.sub, marginTop: 4, display: "flex", gap: 14, fontFamily: t.mono }}>
          <span style={{ fontStyle: "italic", fontFamily: t.serif }}>"{lead.angle}"</span>
          <span>{lead.signals} signals</span>
          <span>{lead.age} old</span>
          <span>due {lead.due}</span>
        </div>
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 6 }}>
          {actions}
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Banner nudge */}
      {pendingList.length >= 2 && (
        <div style={{
          background: `${t.accent2}14`, border: `1px solid ${t.accent2}44`,
          borderRadius: 12, padding: "12px 18px", marginBottom: 20,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ fontSize: 13, color: t.ink }}>
            <span style={{ color: t.accent2, fontWeight: 600 }}>{pendingList.length} leads</span> pending — enough to generate a newsletter draft.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn size="sm" onClick={() => setPage && setPage("issues")}>Open Issues →</Btn>
            <Btn variant="secondary" size="sm">Run editor on Research</Btn>
          </div>
        </div>
      )}

      <PageHeader title="Editorial Leads" sub="Generate, review, and approve editorial leads" />

      {/* Lead generation card */}
      <Card style={{ marginBottom: 20 }}>
        <SectionLabel>Lead generation</SectionLabel>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Select
            value={brand}
            onChange={setBrand}
            options={["Identity Jedi Newsletter", "B2B Creator Weekly", "Enterprise Brief"]}
            style={{ minWidth: 220 }}
          />
          <Btn onClick={runGenerate} disabled={generating}>
            {generating ? (
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 12, height: 12, border: `2px solid rgba(251,247,238,0.3)`,
                  borderTopColor: "#FBF7EE", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite", display: "inline-block",
                }} />
                Generating…
              </span>
            ) : "Generate leads"}
          </Btn>
          <Btn variant="secondary">Get promo</Btn>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 0, borderBottom: `1px solid ${t.line}` }}>
        {tabs.map(tb => (
          <div key={tb.id} onClick={() => setTab(tb.id)} style={{
            padding: "10px 18px", cursor: "pointer", fontSize: 13,
            fontWeight: tab === tb.id ? 500 : 400,
            color: tab === tb.id ? t.ink : t.sub,
            borderBottom: tab === tb.id ? `2px solid ${t.accent}` : "2px solid transparent",
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: -1,
          }}>
            {tb.label}
            {tb.count > 0 && (
              <span style={{
                fontFamily: t.mono, fontSize: 10,
                background: tab === tb.id ? t.accent : t.chip,
                color: tab === tb.id ? "#FBF7EE" : t.sub,
                padding: "1px 6px", borderRadius: 999,
              }}>{tb.count}</span>
            )}
          </div>
        ))}
      </div>

      <Card style={{ borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTop: "none" }}>
        {tab === "pending" && (
          pendingList.length === 0 ? (
            <div style={{ padding: "50px 0", textAlign: "center", color: t.sub }}>
              <div style={{ fontFamily: t.serif, fontStyle: "italic", fontSize: 22, marginBottom: 8 }}>No leads pending review</div>
              <div style={{ fontSize: 13 }}>Generate leads to get started</div>
            </div>
          ) : pendingList.map(l => (
            <LeadCard key={l.id} lead={l} actions={[
              <Btn key="a" variant="positive" size="sm" onClick={() => approve(l)}>Approve</Btn>,
              <Btn key="p" variant="secondary" size="sm" onClick={() => pass(l)}>Pass</Btn>,
            ]} />
          ))
        )}
        {tab === "approved" && (
          approvedList.length === 0 ? (
            <div style={{ padding: "50px 0", textAlign: "center", color: t.sub }}>
              <div style={{ fontFamily: t.serif, fontStyle: "italic", fontSize: 22 }}>No approved leads yet</div>
            </div>
          ) : approvedList.map(l => (
            <LeadCard key={l.id} lead={l} actions={[
              <Btn key="i" variant="ink" size="sm" onClick={() => setPage && setPage("issues")}>→ Draft</Btn>,
            ]} />
          ))
        )}
        {tab === "drafted" && (
          <div style={{ padding: "50px 0", textAlign: "center", color: t.sub }}>
            <div style={{ fontFamily: t.serif, fontStyle: "italic", fontSize: 22, marginBottom: 8 }}>No drafted leads</div>
            <div style={{ fontSize: 13 }}>Drafted leads appear here after Issue generation</div>
          </div>
        )}
      </Card>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: t.ink, color: "#F5EFE4", padding: "10px 20px",
          borderRadius: 8, fontFamily: t.mono, fontSize: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.2)", zIndex: 200,
        }}>{toast}</div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

Object.assign(window, { PageLeads });
