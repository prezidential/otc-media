/**
 * Lightweight structured logs for API routes / workers. No PII — pass ids only.
 */
type LogLevel = "info" | "warn" | "error";

export function opsLog(
  event: string,
  data: Record<string, unknown> = {},
  level: LogLevel = "info"
): void {
  const line = {
    ts: new Date().toISOString(),
    event,
    level,
    ...data,
  };
  const msg = `[ops] ${JSON.stringify(line)}`;
  if (level === "error") console.error(msg);
  else if (level === "warn") console.warn(msg);
  else console.info(msg);
}
