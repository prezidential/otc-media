// Shared mock data across all three directions

const SIGNALS = [
  { id: 1, title: "The Download: an exclusive Jeff VanderMeer story and AI models too scary to release", source: "MIT Technology Review", date: "4/10", topic: "AI", heat: 92, novelty: 88 },
  { id: 2, title: "What's in a name? Moderna's \"vaccine\" vs. \"therapy\" dilemma", source: "MIT Technology Review", date: "4/10", topic: "Biotech", heat: 67, novelty: 71 },
  { id: 3, title: "Inside the lab teaching robots to fold laundry (finally)", source: "The Verge", date: "4/09", topic: "Robotics", heat: 54, novelty: 82 },
  { id: 4, title: "Why the next great search engine might not have a search box", source: "Wired", date: "4/09", topic: "AI", heat: 88, novelty: 95 },
  { id: 5, title: "Climate startups are quietly buying up farmland", source: "Bloomberg", date: "4/08", topic: "Climate", heat: 73, novelty: 64 },
  { id: 6, title: "A field guide to the new generation of open-source LLMs", source: "Ars Technica", date: "4/08", topic: "AI", heat: 81, novelty: 58 },
  { id: 7, title: "The quiet death of the smart home hub", source: "The Verge", date: "4/07", topic: "Consumer", heat: 42, novelty: 76 },
  { id: 8, title: "How three friends built a $40M newsletter in 18 months", source: "The Information", date: "4/07", topic: "Media", heat: 94, novelty: 80 },
];

const LEADS = [
  { id: "L-812", title: "Open-source LLMs hit a pricing floor", status: "approve", signals: 7, angle: "Contrarian: the race to zero is already over", owner: "You", due: "Thu" },
  { id: "L-809", title: "Why newsrooms are hiring 'vibe engineers'", status: "approve", signals: 4, angle: "Profile + trend piece", owner: "You", due: "Fri" },
  { id: "L-803", title: "Robots fold laundry — but who buys one?", status: "draft", signals: 3, angle: "Market-size explainer", owner: "You", due: "Next wk" },
];

const ISSUES = [
  { id: "I-041", title: "Issue 41 — The Agent Economy", state: "in-draft", leads: 4, words: 3200, ready: 0.62 },
  { id: "I-040", title: "Issue 40 — Small Models, Big Checks", state: "published", leads: 5, words: 4100, ready: 1 },
  { id: "I-039", title: "Issue 39 — The Death of the Homepage", state: "published", leads: 3, words: 2800, ready: 1 },
];

const OUTLINES = [
  { id: "O-18", title: "The Agent Economy — long-form", sections: 6, refs: 23 },
  { id: "O-17", title: "Open-source LLM pricing floor", sections: 4, refs: 14 },
];

const PIPELINE = [
  { key: "research", label: "Research", count: 200, sub: "signals" },
  { key: "leads", label: "Leads", count: 12, sub: "to approve" },
  { key: "issues", label: "Issues", count: 3, sub: "in draft" },
  { key: "outlines", label: "Outlines", count: 8, sub: "active" },
];

const ACTIVITY = [
  { t: "2m", text: "Ingested 27 new signals from Dark Reading", kind: "ingest" },
  { t: "14m", text: "Promoted \"Vibe engineers\" to Lead L-809", kind: "promote" },
  { t: "1h",  text: "Research directive \"Agent Economy\" completed — 18 findings", kind: "research" },
  { t: "3h",  text: "Issue 41 outline updated (6 sections)", kind: "outline" },
  { t: "y'day", text: "Published Issue 40 — Small Models, Big Checks", kind: "publish" },
];

Object.assign(window, { SIGNALS, LEADS, ISSUES, OUTLINES, PIPELINE, ACTIVITY });
