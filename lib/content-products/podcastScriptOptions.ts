/**
 * User-tunable podcast script generation (Issues → Phase 2 → Podcast script).
 */

export const PODCAST_DELIVERY = ["conversational", "deep_dive", "narrative"] as const;
export const PODCAST_ENERGY = ["relaxed", "medium", "high"] as const;

export type PodcastDelivery = (typeof PODCAST_DELIVERY)[number];
export type PodcastEnergy = (typeof PODCAST_ENERGY)[number];

export type PodcastScriptRequestOptions = {
  delivery: PodcastDelivery;
  energy: PodcastEnergy;
  customDirection: string;
};

const MAX_CUSTOM = 400;

export function parsePodcastScriptRequestOptions(body: Record<string, unknown>): PodcastScriptRequestOptions {
  const d = body.podcastDelivery;
  const delivery: PodcastDelivery = PODCAST_DELIVERY.includes(d as PodcastDelivery)
    ? (d as PodcastDelivery)
    : "conversational";
  const e = body.podcastEnergy;
  const energy: PodcastEnergy = PODCAST_ENERGY.includes(e as PodcastEnergy) ? (e as PodcastEnergy) : "medium";
  const raw = typeof body.customDirection === "string" ? body.customDirection.trim() : "";
  const customDirection = raw.length > MAX_CUSTOM ? `${raw.slice(0, MAX_CUSTOM - 1)}…` : raw;
  return { delivery, energy, customDirection };
}

export function buildPodcastStyleBlock(opts: PodcastScriptRequestOptions): string {
  const delivery: Record<PodcastDelivery, string> = {
    conversational:
      "Delivery: Solo show in the spirit of modern AI-generated shows (e.g. Notebook-style): warm, curious, lightly witty where appropriate — as if one sharp host is talking to a smart friend, not reading a document aloud. Use \"you\" sometimes. Occasional asides and rhetorical questions. Avoid corporate training tone, avoid monotone listing. Still fact-grounded.",
    deep_dive:
      "Delivery: Conversational but analyst-forward — senior practitioner energy. Fewer jokes, more \"let's unpack why this matters\" framing. Still must sound spoken, not like a whitepaper read aloud.",
    narrative:
      "Delivery: Light narrative arc in one voice — set stakes early, build through the middle, land a memorable close before the CTA. Think story beats without inventing fictional events; only dramatize real implications from the draft and signals.",
  };

  const energy: Record<PodcastEnergy, string> = {
    relaxed:
      "Energy: Relaxed pacing — favor shorter sentence bursts, implied breathing room; do not rush.",
    medium: "Energy: Standard episode pace — mix short punchy lines with occasional longer explanatory sentences.",
    high:
      "Energy: High momentum — shorter sentences on average, crisp transitions, keep listener pulled forward (still clear for TTS).",
  };

  const parts = [delivery[opts.delivery], energy[opts.energy]];
  if (opts.customDirection) {
    parts.push(
      `Creator direction (honor unless it conflicts with accuracy or grounding rules): ${opts.customDirection}`
    );
  }
  return parts.join("\n\n");
}
