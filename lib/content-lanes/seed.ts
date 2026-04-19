export type DefaultLaneSeed = {
  name: string;
  slug: string;
  ring: "inner" | "middle" | "outer";
  description: string;
  audience: string;
  voice_guidance: string;
  topics: string[];
  target_frequency_per_month: number;
};

export const DEFAULT_LANES: DefaultLaneSeed[] = [
  {
    name: "IAM Core",
    slug: "iam-core",
    ring: "inner",
    description: "Identity and access management practitioner content",
    audience: "IAM engineers, identity architects, IGA/PAM analysts",
    voice_guidance:
      "Practitioner-to-peer. Tactical, real-world. Grounded in operational experience. No vendor-speak.",
    topics: ["IGA", "PAM", "zero trust", "identity governance", "access management", "ITDR", "CIEM", "RBAC", "SoD"],
    target_frequency_per_month: 8,
  },
  {
    name: "AI × Identity",
    slug: "ai-identity",
    ring: "middle",
    description: "Intersection of AI adoption and enterprise identity infrastructure",
    audience: "AI practitioners, CTOs, security architects, enterprise IT leaders",
    voice_guidance:
      "Bridge voice — explain identity implications of AI to a technically literate but non-IAM audience. Lead with the enterprise risk angle.",
    topics: [
      "non-human identities",
      "agentic AI",
      "machine identity",
      "AI access governance",
      "NHI",
      "AI agents",
      "LLM security",
    ],
    target_frequency_per_month: 4,
  },
  {
    name: "Practitioner to Leader",
    slug: "practitioner-to-leader",
    ring: "middle",
    description: "Career and leadership content for senior practitioners transitioning to executive roles",
    audience: "Senior engineers, architects, directors moving into CXO or VP-level roles",
    voice_guidance:
      "Autobiographical authority. Personal trajectory as proof. Experiential not prescriptive. Not a listicle.",
    topics: [
      "executive buy-in",
      "technical leadership",
      "influence without authority",
      "program strategy",
      "Field CTO",
      "career transition",
    ],
    target_frequency_per_month: 2,
  },
  {
    name: "B2B Creator",
    slug: "b2b-creator",
    ring: "outer",
    description: "Building a B2B thought leadership brand as a technical practitioner",
    audience: "B2B professionals, consultants, technical practitioners building personal brands",
    voice_guidance:
      "Document the build. Receipts over claims. Show the system, not just the outcome. No generic creator advice.",
    topics: [
      "thought leadership",
      "B2B content",
      "personal brand",
      "content systems",
      "creator economy",
      "newsletter",
      "podcast",
    ],
    target_frequency_per_month: 2,
  },
  {
    name: "Enterprise Program Building",
    slug: "enterprise-programs",
    ring: "middle",
    description: "Standing up and scaling enterprise security and technology programs",
    audience: "Security practitioners, program managers, enterprise IT leaders in GRC, cloud security, and adjacent domains",
    voice_guidance: "Program architect perspective. Cross-functional. Outcomes-first. Applicable beyond identity.",
    topics: [
      "GRC",
      "cloud security",
      "zero trust programs",
      "data governance",
      "enterprise architecture",
      "risk management",
    ],
    target_frequency_per_month: 2,
  },
];
