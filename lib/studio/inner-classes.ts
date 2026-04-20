import { cn } from "@/lib/utils";

/** Studio inner-page layout + surfaces (§ handoff `design_handoff_inner_pages/README.md`). */
export const studioInner = {
  pageRoot: "px-6 py-7 lg:px-11 lg:pb-14 max-w-[1100px] mx-auto w-full text-[#1F1A14]",
  pageRootWide: "px-6 py-7 lg:px-11 lg:pb-14 max-w-[1200px] mx-auto w-full text-[#1F1A14]",
  card: "rounded-[14px] border border-[#E4D9C2] bg-[#FBF7EE] p-5 shadow-[0_1px_0_rgba(30,20,10,0.04),0_14px_30px_-18px_rgba(60,40,10,0.18)]",
  cardPadSm: "rounded-[14px] border border-[#E4D9C2] bg-[#FBF7EE] px-4 py-3 shadow-[0_1px_0_rgba(30,20,10,0.04),0_14px_30px_-18px_rgba(60,40,10,0.18)]",
  /** Nested control / panel on cream (avoid `bg-background` — global theme is dark). */
  surfaceNested: "border border-[#E4D9C2] bg-[#F5EFE4]",
  hoverNested: "hover:bg-[#EBDFC5]/80",
  sectionLabel:
    "font-[family-name:var(--font-geist-mono)] text-[10px] uppercase tracking-[0.2em] text-[#6B5F4E] mb-2.5 flex items-center gap-2",
  body: "text-[13px] leading-relaxed text-[#6B5F4E]",
  /** Primary ink on cream (body copy that must not wash out). */
  inkText: "text-[#1F1A14]",
  /** Muted secondary on cream (labels, helper text). */
  mutedText: "text-[#6B5F4E]",
  /** Draft / markdown `<pre>` on cream — wrap long lines and keep strong contrast. */
  draftBodyPre:
    "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-[15px] leading-7 text-[#1F1A14]",
  draftBodyPreSm:
    "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-sans text-xs leading-6 text-[#1F1A14]",
  draftBodyPreMono:
    "min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-5 text-[#1F1A14]",
  link: "text-[#C8571E] font-medium hover:underline underline-offset-2",
  input:
    "rounded-lg border border-[#E4D9C2] bg-[#F5EFE4] px-3.5 py-2.5 text-[13px] text-[#1F1A14] outline-none placeholder:text-[#9C8E78] focus:ring-1 focus:ring-[#C8571E]/40",
  select:
    "rounded-lg border border-[#E4D9C2] bg-[#F5EFE4] px-3 py-2.5 text-[13px] text-[#1F1A14] outline-none focus:ring-1 focus:ring-[#C8571E]/40",
  textarea:
    "w-full rounded-lg border border-[#E4D9C2] bg-[#F5EFE4] px-3.5 py-2.5 text-[13px] text-[#1F1A14] outline-none focus:ring-1 focus:ring-[#C8571E]/40 resize-y min-h-[100px]",
  textareaMono:
    "w-full rounded-lg border border-[#E4D9C2] bg-[#F5EFE4] px-3 py-2 font-[family-name:var(--font-geist-mono)] text-xs text-[#1F1A14] outline-none focus:ring-1 focus:ring-[#C8571E]/40 resize-y min-h-[100px]",
  btnPrimary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-[#C8571E] px-4 py-2 text-[13px] font-medium text-[#FBF7EE] hover:opacity-90 disabled:opacity-50 transition-opacity",
  btnSecondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-[#E4D9C2] bg-transparent px-4 py-2 text-[13px] font-medium text-[#1F1A14] hover:bg-[#EBDFC5]/50 disabled:opacity-50 transition-colors",
  btnPositive:
    "inline-flex items-center justify-center gap-2 rounded-full bg-[#3F6B45] px-4 py-2 text-[13px] font-medium text-[#FBF7EE] hover:opacity-90 disabled:opacity-50 transition-opacity",
  btnInk:
    "inline-flex items-center justify-center gap-2 rounded-full bg-[#1F1A14] px-4 py-2 text-[13px] font-medium text-[#F5EFE4] hover:opacity-90 disabled:opacity-50 transition-opacity",
  tag: "inline-flex items-center rounded-[3px] bg-[#EBDFC5] px-2 py-0.5 font-[family-name:var(--font-geist-mono)] text-[9px] font-semibold uppercase tracking-[0.12em] text-[#6B5F4E]",
  tagOrange: "bg-[#C8571E22] text-[#C8571E]",
  tagGreen: "bg-[#3F6B4522] text-[#3F6B45]",
} as const;

export function studioTab(active: boolean) {
  return cn(
    "inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors",
    active ? "border-[#C8571E] font-medium text-[#1F1A14]" : "border-transparent text-[#6B5F4E] hover:text-[#1F1A14]"
  );
}

/** Tab count pill — active: orange on white; inactive: chip. */
export function studioTabCountBadge(active: boolean) {
  return cn(
    "ml-1 min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-[10px] font-[family-name:var(--font-geist-mono)] font-semibold tabular-nums",
    active ? "bg-[#C8571E] text-[#FBF7EE]" : "bg-[#EBDFC5] text-[#6B5F4E]"
  );
}
