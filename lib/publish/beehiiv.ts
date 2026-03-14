const BEEHIIV_API_BASE = "https://api.beehiiv.com/v2";

export function isBeehiivEnabled(): boolean {
  return process.env.BEEHIIV_ENABLED === "true"
    && !!process.env.BEEHIIV_API_KEY
    && !!process.env.BEEHIIV_PUBLICATION_ID;
}

export type BeehiivPostResult = {
  id: string;
  title: string;
  status: string;
  web_url: string;
};

export async function createBeehiivDraft(params: {
  title: string;
  subtitle?: string;
  htmlContent: string;
}): Promise<BeehiivPostResult> {
  if (!isBeehiivEnabled()) {
    throw new Error("Beehiiv integration is not enabled. Set BEEHIIV_ENABLED=true with valid API credentials.");
  }

  const apiKey = process.env.BEEHIIV_API_KEY!;
  const pubId = process.env.BEEHIIV_PUBLICATION_ID!;

  const res = await fetch(`${BEEHIIV_API_BASE}/publications/${pubId}/posts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      subtitle: params.subtitle || undefined,
      body_content: params.htmlContent,
      status: "draft",
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errMsg = body.errors?.[0]?.message || body.message || `HTTP ${res.status}`;
    throw new Error(`Beehiiv API error: ${errMsg}`);
  }

  const data = await res.json();
  return {
    id: data.data.id,
    title: data.data.title,
    status: data.data.status,
    web_url: data.data.web_url ?? "",
  };
}
