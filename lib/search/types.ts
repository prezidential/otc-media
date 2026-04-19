export type SearchResultPayload = {
  signals: Array<{ id: string; title: string; url: string; publisher: string }>;
  leads: Array<{ id: string; angle: string; status: string }>;
  drafts: Array<{ id: string; preview: string; created_at: string }>;
  outlines: Array<{ id: string; name: string; kind: string }>;
};
