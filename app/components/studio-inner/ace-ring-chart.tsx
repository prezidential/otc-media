"use client";

import { useMemo, useState } from "react";

export type AceRingLane = {
  name: string;
  ring: "inner" | "middle" | "outer";
  current: number;
  target: number;
};

const AD = {
  amber: "#E8A24A",
  middle: "#C87B3C",
  green: "#6FAE7F",
  panel: "#181410",
  border: "#2C2318",
  sub: "#7A6A52",
  ink: "#F0E6CF",
};

const CONFIG = {
  inner: { r: 62, sw: 30, color: AD.amber, dimColor: "#2C2318" },
  middle: { r: 104, sw: 26, color: AD.middle, dimColor: "#2A1E10" },
  outer: { r: 144, sw: 22, color: AD.green, dimColor: "#1A2820" },
} as const;

function arcForTier(tier: keyof typeof CONFIG, pct: number) {
  const { r } = CONFIG[tier];
  const circ = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(1, pct)) * circ;
  return { dasharray: `${fill} ${circ}`, dashoffset: circ * 0.25 };
}

export function AceRingChart({ lanes, animating }: { lanes: AceRingLane[]; animating?: boolean }) {
  const [hoveredTier, setHoveredTier] = useState<keyof typeof CONFIG | null>(null);
  const cx = 190;
  const cy = 190;
  const size = 380;

  const tierTotals = useMemo(() => {
    const sum = (ring: AceRingLane["ring"]) =>
      lanes.filter((l) => l.ring === ring).reduce((s, l) => s + l.current, 0);
    const tgt = (ring: AceRingLane["ring"]) =>
      lanes.filter((l) => l.ring === ring).reduce((s, l) => s + l.target, 0);
    return {
      inner: { current: sum("inner"), target: tgt("inner") },
      middle: { current: sum("middle"), target: tgt("middle") },
      outer: { current: sum("outer"), target: tgt("outer") },
    };
  }, [lanes]);

  const overallPct = useMemo(() => {
    if (lanes.length === 0) return 0;
    const pct = (tier: keyof typeof CONFIG) => {
      const t = tierTotals[tier];
      return t.target > 0 ? t.current / t.target : 0;
    };
    const p = (pct("inner") + pct("middle") + pct("outer")) / 3;
    return Math.round(Math.min(1, p) * 100);
  }, [lanes.length, tierTotals]);

  const statusText =
    overallPct === 0 ? "EMPTY" : overallPct < 40 ? "NEEDS WORK" : overallPct < 80 ? "BUILDING" : "BALANCED";
  const statusColor =
    overallPct === 0 ? AD.sub : overallPct < 40 ? AD.amber : overallPct < 80 ? AD.middle : AD.green;

  return (
    <div className="flex shrink-0 max-w-full flex-col items-center">
      <div className="relative h-[380px] w-[380px]">
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full" aria-hidden>
        <defs>
          <filter id="aceGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="aceGlowSoft" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={170} fill="none" stroke={AD.amber} strokeWidth={1} opacity={0.06} />
        <circle cx={cx} cy={cy} r={178} fill="none" stroke={AD.amber} strokeWidth={0.5} opacity={0.04} />
        {(["outer", "middle", "inner"] as const).map((tier) => {
          const { r, sw, color, dimColor } = CONFIG[tier];
          const totals = tierTotals[tier];
          const pct = totals.target > 0 ? totals.current / totals.target : 0;
          const a = arcForTier(tier, pct);
          const isHov = hoveredTier === tier;
          return (
            <g
              key={tier}
              onMouseEnter={() => setHoveredTier(tier)}
              onMouseLeave={() => setHoveredTier(null)}
              className="cursor-pointer"
            >
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={dimColor} strokeWidth={sw} />
              {pct > 0 && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={isHov ? "#fff" : color}
                  strokeWidth={sw}
                  strokeDasharray={a.dasharray}
                  strokeDashoffset={a.dashoffset}
                  strokeLinecap="round"
                  opacity={isHov ? 0.9 : 1}
                  filter={isHov ? "url(#aceGlow)" : "url(#aceGlowSoft)"}
                  style={{ transition: animating ? "stroke-dasharray 1.4s cubic-bezier(0.4,0,0.2,1)" : undefined }}
                />
              )}
              {isHov && <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={sw + 6} opacity={0.08} />}
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r={38} fill={AD.panel} />
        <circle cx={cx} cy={cy} r={38} fill="none" stroke={AD.border} strokeWidth={1} />
        <text x={cx} y={cy - 6} textAnchor="middle" className="fill-current font-[family-name:var(--font-geist-mono)] text-[20px] font-bold" style={{ fill: statusColor }}>
          {overallPct}%
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="font-[family-name:var(--font-geist-mono)] text-[8px] uppercase tracking-[0.15em]"
          style={{ fill: AD.sub }}
        >
          {statusText}
        </text>
      </svg>

      {hoveredTier &&
        (() => {
          const totals = tierTotals[hoveredTier];
          const tierLanes = lanes.filter((l) => l.ring === hoveredTier);
          const positions: Record<keyof typeof CONFIG, { top: string; left: string }> = {
            inner: { top: "38%", left: "calc(100% + 12px)" },
            middle: { top: "20%", left: "calc(100% + 12px)" },
            outer: { top: "6%", left: "calc(100% + 12px)" },
          };
          const pos = positions[hoveredTier];
          return (
            <div
              className="pointer-events-none absolute z-10 min-w-[180px] rounded-[10px] border p-3 text-left shadow-lg"
              style={{
                top: pos.top,
                left: pos.left,
                background: "#211B14",
                borderColor: AD.border,
              }}
            >
              <div className="mb-2 font-[family-name:var(--font-geist-mono)] text-[9px] uppercase tracking-[0.15em] text-[#7A6A52]">
                {hoveredTier} ring
              </div>
              {tierLanes.map((l) => (
                <div key={l.name} className="mb-1 flex justify-between gap-4 text-[12px]" style={{ color: AD.ink }}>
                  <span>{l.name}</span>
                  <span className="font-[family-name:var(--font-geist-mono)] text-[11px]" style={{ color: l.current > 0 ? AD.green : AD.sub }}>
                    {l.current}/{l.target}
                  </span>
                </div>
              ))}
              <div
                className="mt-2 flex justify-between border-t pt-2 font-[family-name:var(--font-geist-mono)] text-[10px]"
                style={{ borderColor: AD.border, color: AD.sub }}
              >
                <span>total</span>
                <span style={{ color: AD.ink }}>
                  {totals.current} / {totals.target}
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      <div className="mt-2 flex flex-wrap justify-center gap-6 font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.12em] text-[#7A6A52]">
        {(["inner", "middle", "outer"] as const).map((tier) => {
          const t = tierTotals[tier];
          const pct = t.target > 0 ? Math.round(Math.min(1, t.current / t.target) * 100) : 0;
          const dot =
            tier === "inner" ? AD.amber : tier === "middle" ? AD.middle : AD.green;
          return (
            <div key={tier} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: dot }} />
              <span>{tier}</span>
              <span style={{ color: AD.ink }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
