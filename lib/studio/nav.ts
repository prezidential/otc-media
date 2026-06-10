/** Studio shell navigation. Grouped into a primary "loop spine" + secondary
 * sections (§3.19 P1d) so the creator workflow reads top-to-bottom. The flat
 * `STUDIO_NAV` is derived for the command palette + mobile pills. */
export type StudioNavItem = { href: string; label: string; keywords: string };
export type StudioNavSection = { label: string | null; items: StudioNavItem[] };

export const STUDIO_NAV_SECTIONS: StudioNavSection[] = [
  {
    // The loop spine — Home, then brainstorm → draft → analytics.
    label: null,
    items: [
      { href: "/dashboard", label: "Dashboard", keywords: "home newsroom dashboard" },
      { href: "/brainstorm", label: "Brainstorm", keywords: "ideation chat signals hub" },
      { href: "/issues", label: "Issues", keywords: "newsletter draft" },
      { href: "/integrations/analytics", label: "Analytics", keywords: "beehiiv supergrow stats subscribers impressions newsletter linkedin" },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/signals", label: "Signals", keywords: "rss ingest" },
      { href: "/leads", label: "Leads", keywords: "approve editorial" },
      { href: "/research", label: "Research", keywords: "directives pipeline" },
      { href: "/outlines", label: "Outlines", keywords: "templates" },
      { href: "/runs", label: "Pipeline", keywords: "runs agent history failures status orchestrator" },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/brand-profiles", label: "Brand", keywords: "voice profile" },
      { href: "/ace", label: "ACE", keywords: "autonomous telegram" },
      { href: "/integrations", label: "Integrations", keywords: "beehiiv supergrow connections plugins api mcp" },
    ],
  },
];

/** Flat list (loop spine first), for the command palette + mobile pill nav. */
export const STUDIO_NAV = STUDIO_NAV_SECTIONS.flatMap((s) => s.items);
