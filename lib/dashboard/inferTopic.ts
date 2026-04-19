/** Lightweight topic bucket for Studio signal filters (not persisted). */
export function inferTopicFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/\b(ai|llm|gpt|openai|anthropic|machine learning|neural)\b/.test(t)) return "AI";
  if (/\b(biotech|fda|clinical|vaccine|moderna|pfizer|gene)\b/.test(t)) return "Biotech";
  if (/\b(robot|robotics|drone|automation|factory)\b/.test(t)) return "Robotics";
  if (/\b(climate|carbon|energy|solar|grid)\b/.test(t)) return "Climate";
  if (/\b(media|newsletter|subscriber|journalism|broadcast)\b/.test(t)) return "Media";
  if (/\b(consumer|retail|iphone|android|app store)\b/.test(t)) return "Consumer";
  if (/\b(identity|iam|security|breach|zero trust|sso)\b/.test(t)) return "Identity";
  return "General";
}

export const STUDIO_TOPIC_FILTERS = ["All", "AI", "Identity", "Biotech", "Robotics", "Climate", "Media", "Consumer", "General"] as const;
