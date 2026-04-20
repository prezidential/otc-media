"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Instrument_Serif, Geist_Mono } from "next/font/google";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardStatsPayload } from "@/lib/dashboard/stats";
import { STUDIO_NAV } from "@/lib/studio/nav";
import { StudioUIProvider } from "./studio-ui-context";
import { StudioCommandPalette } from "./studio-command-palette";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

const BADGE_KEYS = ["signalsIngested24h", "leadsToApprove", "issuesDrafting"] as const;

const NAV: { href: string; label: string; badgeKey?: (typeof BADGE_KEYS)[number] }[] = STUDIO_NAV.map((item) => {
  const badgeKey: (typeof BADGE_KEYS)[number] | undefined =
    item.href === "/signals"
      ? "signalsIngested24h"
      : item.href === "/leads"
        ? "leadsToApprove"
        : item.href === "/issues"
          ? "issuesDrafting"
          : undefined;
  return { href: item.href, label: item.label, ...(badgeKey ? { badgeKey } : {}) };
});

export function StudioAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [stats, setStats] = useState<DashboardStatsPayload | null>(null);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/stats");
        const j = (await res.json()) as DashboardStatsPayload & { error?: string };
        if (!cancelled && !("error" in j && j.error)) setStats(j as DashboardStatsPayload);
      } catch {
        /* optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const s = stats?.sidebar;
  const isAce = pathname === "/ace" || pathname.startsWith("/ace/");

  return (
    <StudioUIProvider>
    <div
      className={cn(
        "min-h-screen flex flex-col lg:flex-row text-[#1F1A14]",
        instrumentSerif.variable,
        geistMono.variable
      )}
      style={{ backgroundColor: "#F5EFE4" }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3 lg:hidden"
        style={{ borderColor: "#E4D9C2", backgroundColor: "#FBF7EE" }}
      >
        <Link href="/dashboard" className="font-[family-name:var(--font-instrument-serif)] text-lg">
          Cornerstone
        </Link>
        <button
          type="button"
          aria-label={mobileNav ? "Close menu" : "Open menu"}
          className="rounded-md border p-2"
          style={{ borderColor: "#E4D9C2" }}
          onClick={() => setMobileNav((o) => !o)}
        >
          {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {mobileNav && (
        <nav
          className="flex flex-wrap gap-2 border-b px-4 py-3 lg:hidden"
          style={{ borderColor: "#E4D9C2", backgroundColor: "#FBF7EE" }}
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNav(false)}
              className="rounded-full px-3 py-1.5 text-sm"
              style={{ backgroundColor: "#EBDFC5", color: "#1F1A14" }}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <aside
        className="hidden lg:flex w-[230px] shrink-0 flex-col border-r"
        style={{ backgroundColor: "#F5EFE4", borderColor: "#E4D9C2" }}
      >
        <div className="p-6 border-b" style={{ borderColor: "#E4D9C2" }}>
          <Link href="/dashboard" className="block">
            <div className="font-[family-name:var(--font-instrument-serif)] text-2xl tracking-tight text-[#1A1A1A]">
              Cornerstone
            </div>
            <div className="mt-1 text-[10px] font-[family-name:var(--font-geist-mono)] uppercase tracking-[0.2em] text-[#6B6B6B]">
              Studio
            </div>
          </Link>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isAceItem = item.href === "/ace";
            const badge =
              item.badgeKey && s && typeof s[item.badgeKey] === "number" && s[item.badgeKey] > 0
                ? (s[item.badgeKey] as number)
                : null;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                  isAceItem && active
                    ? "bg-[#1F1A14] text-[#F5EFE4] border border-[#2C2318] relative"
                    : active
                      ? "bg-[#EBDFC5] text-[#1A1A1A] font-medium border border-[#E4D9C2]"
                      : "text-[#6B6B6B] hover:bg-[#FBF7EE]/60 hover:text-[#1A1A1A]"
                )}
              >
                <span className="flex items-center gap-2">
                  {isAceItem && active && (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#E8A24A] opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-[#E8A24A]" />
                    </span>
                  )}
                  {item.label}
                </span>
                {badge != null && !isAceItem && (
                  <span className="font-[family-name:var(--font-geist-mono)] text-[11px] text-[#6B5F4E] tabular-nums">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-[#E8E0D4] space-y-1">
          <div className="text-[10px] font-[family-name:var(--font-geist-mono)] uppercase tracking-widest text-[#6B6B6B]">
            Today
          </div>
          {s ? (
            <>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">{s.signalsIngestedLine}</p>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">{s.leadsLine}</p>
              <p className="text-xs text-[#6B6B6B] leading-relaxed">{s.issuesLine}</p>
            </>
          ) : (
            <p className="text-xs text-[#6B6B6B]">Loading…</p>
          )}
        </div>
      </aside>
      <div
        className={cn(
          "flex-1 min-w-0 overflow-y-auto",
          isAce ? "bg-[#0F0C08] text-[#F0E6CF]" : "bg-[#F5EFE4]"
        )}
      >
        {children}
      </div>
      <StudioCommandPalette />
    </div>
    </StudioUIProvider>
  );
}
