import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export type LLMProvider = "anthropic" | "openai";

export type LLMMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type LLMRequestOptions = {
  max_tokens?: number;
  temperature?: number;
};

export type LLMResponse = {
  text: string;
  provider: LLMProvider;
  model: string;
};

export type AgentRole =
  | "research"
  | "leads"
  | "editor"
  | "drafting"
  | "revision"
  | "lint"
  | "linkedin"
  | "brainstorm"
  | "integration";

type RoleConfig = {
  provider: LLMProvider;
  model: string;
};

const DEFAULT_MODELS: Record<LLMProvider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

function getRoleConfig(role: AgentRole): RoleConfig {
  const envKey = `LLM_${role.toUpperCase()}`;
  const envVal = process.env[envKey];

  if (envVal) {
    const [provider, model] = envVal.split(":");
    if (provider === "anthropic" || provider === "openai") {
      return { provider, model: model || DEFAULT_MODELS[provider] };
    }
  }

  const globalProvider = (process.env.LLM_PROVIDER as LLMProvider) || "anthropic";
  const globalModel = process.env.LLM_MODEL || DEFAULT_MODELS[globalProvider];
  return { provider: globalProvider, model: globalModel };
}

let anthropicInstance: Anthropic | null = null;
let openaiInstance: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
    anthropicInstance = new Anthropic({ apiKey: key });
  }
  return anthropicInstance;
}

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not set");
    openaiInstance = new OpenAI({ apiKey: key });
  }
  return openaiInstance;
}

async function callAnthropic(
  model: string,
  messages: LLMMessage[],
  opts: LLMRequestOptions
): Promise<string> {
  const client = getAnthropic();
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");

  const msg = await client.messages.create({
    model,
    max_tokens: opts.max_tokens ?? 4096,
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    ...(systemMsg && { system: systemMsg.content }),
    messages: nonSystem.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  const textBlock = msg.content?.find((b) => b.type === "text");
  return textBlock && textBlock.type === "text"
    ? (textBlock as { type: "text"; text: string }).text.trim()
    : "";
}

async function callOpenAI(
  model: string,
  messages: LLMMessage[],
  opts: LLMRequestOptions
): Promise<string> {
  const client = getOpenAI();

  const response = await client.chat.completions.create({
    model,
    max_tokens: opts.max_tokens ?? 4096,
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  return response.choices[0]?.message?.content?.trim() ?? "";
}

export async function callLLM(
  role: AgentRole,
  messages: LLMMessage[],
  opts: LLMRequestOptions = {}
): Promise<LLMResponse> {
  const config = getRoleConfig(role);

  let text: string;
  if (config.provider === "openai") {
    text = await callOpenAI(config.model, messages, opts);
  } else {
    text = await callAnthropic(config.model, messages, opts);
  }

  return { text, provider: config.provider, model: config.model };
}

async function* streamAnthropic(
  model: string,
  messages: LLMMessage[],
  opts: LLMRequestOptions
): AsyncGenerator<string> {
  const client = getAnthropic();
  const systemMsg = messages.find((m) => m.role === "system");
  const nonSystem = messages.filter((m) => m.role !== "system");
  const messageStream = client.messages.stream({
    model,
    max_tokens: opts.max_tokens ?? 4096,
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    ...(systemMsg && { system: systemMsg.content }),
    messages: nonSystem.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  });

  const queue: string[] = [];
  let notify: (() => void) | null = null;
  const waitChunk = () =>
    new Promise<void>((resolve) => {
      notify = resolve;
    });

  messageStream.on("text", (delta: string) => {
    queue.push(delta);
    const n = notify;
    notify = null;
    n?.();
  });

  const settled = messageStream.finalText().then(
    () => ({ ok: true as const }),
    (err: unknown) => ({ ok: false as const, err })
  );

  for (;;) {
    if (queue.length > 0) {
      yield queue.shift()!;
      continue;
    }
    const winner = await Promise.race([
      waitChunk().then(() => "chunk" as const),
      settled,
    ]);
    if (winner !== "chunk") {
      if (!winner.ok) throw winner.err instanceof Error ? winner.err : new Error(String(winner.err));
      while (queue.length > 0) yield queue.shift()!;
      break;
    }
  }
}

async function* streamOpenAI(
  model: string,
  messages: LLMMessage[],
  opts: LLMRequestOptions
): AsyncGenerator<string> {
  const client = getOpenAI();
  const stream = await client.chat.completions.create({
    model,
    max_tokens: opts.max_tokens ?? 4096,
    ...(opts.temperature !== undefined && { temperature: opts.temperature }),
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  });

  for await (const chunk of stream) {
    const t = chunk.choices[0]?.delta?.content;
    if (t) yield t;
  }
}

/** Token deltas for a single completion (same routing as `callLLM`). */
export async function* streamLLM(
  role: AgentRole,
  messages: LLMMessage[],
  opts: LLMRequestOptions = {}
): AsyncGenerator<string> {
  const config = getRoleConfig(role);
  if (config.provider === "openai") {
    yield* streamOpenAI(config.model, messages, opts);
  } else {
    yield* streamAnthropic(config.model, messages, opts);
  }
}

export function getModelForRole(role: AgentRole): { provider: LLMProvider; model: string } {
  return getRoleConfig(role);
}
