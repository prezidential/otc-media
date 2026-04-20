// Shared Studio theme tokens — available globally as window.T
window.T = {
  bg:      "#F5EFE4",
  panel:   "#FBF7EE",
  ink:     "#1F1A14",
  sub:     "#6B5F4E",
  line:    "#E4D9C2",
  accent:  "#C8571E",   // burnt orange — all primary CTAs
  accent2: "#3F6B45",   // forest green — approve / positive
  chip:    "#EBDFC5",
  shadow:  "0 1px 0 rgba(30,20,10,0.04), 0 14px 30px -18px rgba(60,40,10,0.18)",
  serif:   "'Instrument Serif', Georgia, serif",
  sans:    "'Geist', system-ui, sans-serif",
  mono:    "'JetBrains Mono', monospace",
};

// Reusable primitive components
function Btn({ children, variant = "primary", size = "md", onClick, disabled, style = {} }) {
  const t = window.T;
  const base = {
    fontFamily: t.sans, fontWeight: 500, border: "none",
    borderRadius: 999, cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.55 : 1, display: "inline-flex",
    alignItems: "center", gap: 6, transition: "opacity 120ms",
    ...style,
  };
  const sizes = { sm: { fontSize: 11, padding: "5px 12px" }, md: { fontSize: 13, padding: "8px 16px" }, lg: { fontSize: 14, padding: "11px 22px" } };
  const variants = {
    primary: { background: t.accent, color: "#FBF7EE" },
    secondary: { background: "transparent", color: t.ink, border: `1px solid ${t.line}` },
    ghost: { background: "transparent", color: t.sub },
    positive: { background: t.accent2, color: "#FBF7EE" },
    ink: { background: t.ink, color: t.bg },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...sizes[size], ...variants[variant] }}>{children}</button>;
}

function Card({ children, style = {}, pad = "20px 22px" }) {
  const t = window.T;
  return (
    <div style={{
      background: t.panel, border: `1px solid ${t.line}`,
      borderRadius: 14, padding: pad,
      boxShadow: t.shadow, ...style,
    }}>{children}</div>
  );
}

function SectionLabel({ children }) {
  const t = window.T;
  return <div style={{ fontFamily: t.mono, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: t.sub, marginBottom: 10 }}>{children}</div>;
}

function PageHeader({ title, sub }) {
  const t = window.T;
  return (
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ fontFamily: t.serif, fontStyle: "italic", fontSize: 42, fontWeight: 400, margin: 0, lineHeight: 1, letterSpacing: -0.5 }}>{title}</h1>
      {sub && <div style={{ fontSize: 13, color: t.sub, marginTop: 8, lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );
}

function Tag({ children, color }) {
  const t = window.T;
  const bg = color === "orange" ? `${t.accent}22` : color === "green" ? `${t.accent2}22` : t.chip;
  const fg = color === "orange" ? t.accent : color === "green" ? t.accent2 : t.sub;
  return (
    <span style={{
      fontFamily: t.mono, fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
      padding: "3px 8px", borderRadius: 3, background: bg, color: fg, fontWeight: 600,
    }}>{children}</span>
  );
}

function Divider() {
  return <div style={{ height: 1, background: window.T.line, margin: "0" }} />;
}

function Input({ value, onChange, placeholder, style = {}, mono }) {
  const t = window.T;
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} style={{
      padding: "10px 14px", fontFamily: mono ? t.mono : t.sans, fontSize: 13,
      background: t.bg, color: t.ink, border: `1px solid ${t.line}`,
      borderRadius: 8, outline: "none", width: "100%", boxSizing: "border-box", ...style,
    }} />
  );
}

function Select({ value, onChange, options, style = {} }) {
  const t = window.T;
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      padding: "9px 32px 9px 12px", fontFamily: t.sans, fontSize: 13,
      background: t.bg, color: t.ink, border: `1px solid ${t.line}`,
      borderRadius: 8, outline: "none", cursor: "pointer",
      appearance: "none",
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%236B5F4E' stroke-width='1.5'/%3E%3C/svg%3E")`,
      backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
      ...style,
    }}>
      {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
    </select>
  );
}

function Textarea({ value, onChange, rows = 6, mono, placeholder }) {
  const t = window.T;
  return (
    <textarea value={value} onChange={onChange} rows={rows} placeholder={placeholder} style={{
      width: "100%", boxSizing: "border-box",
      padding: "12px 14px", fontFamily: mono ? t.mono : t.sans, fontSize: 12,
      background: t.bg, color: t.ink, border: `1px solid ${t.line}`,
      borderRadius: 8, outline: "none", resize: "vertical", lineHeight: 1.6,
    }} />
  );
}

Object.assign(window, { Btn, Card, SectionLabel, PageHeader, Tag, Divider, Input, Select, Textarea });
