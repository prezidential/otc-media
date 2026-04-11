export type PodcastScriptSegment = {
  id: string;
  title?: string;
  narrator_text: string;
};

/** TTS-ready podcast script from draft + signal grounding (content products). */
export type PodcastScript = {
  working_title: string;
  estimated_runtime_minutes?: number;
  script_segments: PodcastScriptSegment[];
  sources_acknowledged?: string[];
  outro_cta?: string;
};

export function fullNarrationText(script: PodcastScript): string {
  const parts = script.script_segments.map((s) => s.narrator_text.trim()).filter(Boolean);
  const outro = script.outro_cta?.trim();
  if (outro) parts.push(outro);
  return parts.join("\n\n");
}
