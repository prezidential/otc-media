/** Primary Studio shell navigation (sidebar + command palette). */
export const STUDIO_NAV = [
  { href: "/dashboard", label: "Dashboard", keywords: "home" },
  { href: "/signals", label: "Signals", keywords: "rss ingest" },
  { href: "/leads", label: "Leads", keywords: "approve editorial" },
  { href: "/issues", label: "Issues", keywords: "newsletter draft" },
  { href: "/outlines", label: "Outlines", keywords: "templates" },
  { href: "/brand-profiles", label: "Brand", keywords: "voice profile" },
  { href: "/research", label: "Research", keywords: "directives pipeline" },
  { href: "/ace", label: "ACE", keywords: "autonomous telegram" },
] as const;
