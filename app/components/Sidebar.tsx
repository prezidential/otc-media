"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Signals", icon: SignalsIcon },
  { href: "/research", label: "Research", icon: ResearchIcon },
  { href: "/leads", label: "Leads", icon: LeadsIcon },
  { href: "/issues", label: "Issues", icon: IssuesIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: 220,
        minHeight: "100vh",
        background: "var(--sidebar-bg)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 0",
        position: "fixed",
        left: 0,
        top: 0,
        bottom: 0,
        zIndex: 50,
      }}
    >
      <div style={{ padding: "0 20px", marginBottom: 32 }}>
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: "var(--sidebar-fg-active)",
            letterSpacing: "-0.02em",
          }}
        >
          Cornerstone
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--sidebar-fg)",
            marginTop: 2,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Newsroom Engine
        </div>
      </div>

      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, padding: "0 8px" }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--sidebar-fg-active)" : "var(--sidebar-fg)",
                background: active ? "var(--sidebar-accent)" : "transparent",
                textDecoration: "none",
                transition: "background 0.15s, color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.background = "transparent";
              }}
            >
              <item.icon active={active} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ padding: "0 20px", fontSize: 11, color: "var(--sidebar-fg)", opacity: 0.6 }}>
        OTC Media v1.1
      </div>
    </aside>
  );
}

function SignalsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "var(--sidebar-fg)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h4l3-9 4 18 3-9h4" />
    </svg>
  );
}

function ResearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "var(--sidebar-fg)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function LeadsIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "var(--sidebar-fg)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  );
}

function IssuesIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "var(--sidebar-fg)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" />
    </svg>
  );
}
