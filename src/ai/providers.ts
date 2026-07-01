/** A model endpoint the assistant can talk to. */
export interface Provider {
  id: string;
  label: string;
  /** request/response dialect: Anthropic Messages vs OpenAI Chat Completions. */
  kind: "anthropic" | "openai";
  baseUrl: string;
  /** has a genuinely usable free tier (no card needed unless noted). */
  free: boolean;
  /** our recommended free pick. */
  recommended?: boolean;
  /** runs locally / needs no API key (e.g. Ollama). */
  keyless?: boolean;
  /** where the user creates a key. */
  keyUrl: string;
  keyHint: string;
  models: { id: string; label: string }[];
  note: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "groq",
    label: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    free: true,
    recommended: true,
    keyUrl: "https://console.groq.com/keys",
    keyHint: "gsk_…",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B · fastest" },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout" },
      { id: "meta-llama/llama-4-maverick-17b-128e-instruct", label: "Llama 4 Maverick" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "openai/gpt-oss-20b", label: "GPT-OSS 20B" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" },
      { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2" },
      { id: "qwen/qwen3-32b", label: "Qwen3 32B" },
      { id: "gemma2-9b-it", label: "Gemma 2 9B" },
    ],
    note: "Free, no credit card. Very fast. Best free pick.",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    kind: "openai",
    baseUrl: "https://api.cerebras.ai/v1",
    free: true,
    keyUrl: "https://cloud.cerebras.ai/",
    keyHint: "csk-…",
    models: [
      { id: "llama-3.3-70b", label: "Llama 3.3 70B" },
      { id: "llama3.1-8b", label: "Llama 3.1 8B · fastest" },
      { id: "llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout" },
      { id: "qwen-3-32b", label: "Qwen3 32B" },
      { id: "gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 70B" },
    ],
    note: "Free tier, extremely fast inference (wafer-scale).",
  },
  {
    id: "google",
    label: "Google Gemini",
    kind: "openai",
    // Gemini's OpenAI-compatible endpoint — works with the same Chat Completions adapter
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    free: true,
    keyUrl: "https://aistudio.google.com/apikey",
    keyHint: "AIza…",
    models: [
      { id: "gemini-2.5-flash", label: "2.5 Flash · best free" },
      { id: "gemini-2.5-pro", label: "2.5 Pro · most capable" },
      { id: "gemini-2.5-flash-lite", label: "2.5 Flash-Lite · cheapest" },
      { id: "gemini-2.0-flash", label: "2.0 Flash" },
      { id: "gemini-2.0-flash-lite", label: "2.0 Flash-Lite" },
      { id: "gemini-1.5-pro", label: "1.5 Pro" },
      { id: "gemini-1.5-flash", label: "1.5 Flash" },
      { id: "gemini-1.5-flash-8b", label: "1.5 Flash-8B" },
    ],
    note: "Generous free tier from Google AI Studio. Strong, and great at tool use.",
  },
  {
    id: "mistral",
    label: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    free: true,
    keyUrl: "https://console.mistral.ai/api-keys",
    keyHint: "…",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-medium-latest", label: "Mistral Medium" },
      { id: "mistral-small-latest", label: "Mistral Small · free" },
      { id: "magistral-medium-latest", label: "Magistral Medium · reasoning" },
      { id: "magistral-small-latest", label: "Magistral Small · reasoning" },
      { id: "codestral-latest", label: "Codestral · code" },
      { id: "ministral-8b-latest", label: "Ministral 8B" },
      { id: "ministral-3b-latest", label: "Ministral 3B" },
      { id: "open-mistral-nemo", label: "Mistral Nemo" },
      { id: "pixtral-large-latest", label: "Pixtral Large · vision" },
    ],
    note: "European models with a free tier on La Plateforme.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    free: true,
    keyUrl: "https://openrouter.ai/keys",
    keyHint: "sk-or-…",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)" },
      { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)" },
      { id: "deepseek/deepseek-r1:free", label: "DeepSeek R1 (free)" },
      { id: "deepseek/deepseek-chat-v3-0324:free", label: "DeepSeek V3 (free)" },
      { id: "qwen/qwen3-235b-a22b:free", label: "Qwen3 235B (free)" },
      { id: "meta-llama/llama-4-maverick:free", label: "Llama 4 Maverick (free)" },
      { id: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "openai/gpt-4o", label: "GPT-4o" },
      { id: "x-ai/grok-4", label: "Grok 4" },
      { id: "mistralai/mistral-large", label: "Mistral Large" },
    ],
    note: "One key, 300+ models — many with a :free tier. Great for trying things.",
  },
  {
    id: "ollama",
    label: "Ollama · local",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    free: true,
    keyless: true,
    keyUrl: "https://ollama.com/download",
    keyHint: "",
    models: [
      { id: "llama3.2", label: "Llama 3.2" },
      { id: "llama3.1", label: "Llama 3.1 8B" },
      { id: "llama3.3", label: "Llama 3.3 70B" },
      { id: "qwen2.5", label: "Qwen 2.5" },
      { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
      { id: "mistral", label: "Mistral" },
      { id: "gemma2", label: "Gemma 2" },
      { id: "phi4", label: "Phi-4" },
      { id: "deepseek-r1", label: "DeepSeek R1" },
    ],
    note: "Runs models on YOUR machine — free, private, offline. Needs `ollama serve` (set OLLAMA_ORIGINS=* for browser access).",
  },
  {
    id: "anthropic",
    label: "Anthropic · Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    free: false,
    keyUrl: "https://console.anthropic.com/settings/keys",
    keyHint: "sk-ant-…",
    models: [
      { id: "claude-opus-4-8", label: "Opus 4.8 · deepest" },
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · balanced" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 · fast" },
      { id: "claude-fable-5", label: "Fable 5" },
      { id: "claude-3-7-sonnet-latest", label: "Claude 3.7 Sonnet" },
      { id: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
      { id: "claude-3-opus-latest", label: "Claude 3 Opus" },
    ],
    note: "Paid. Highest quality for this kind of agentic retrieval.",
  },
  {
    id: "openai",
    label: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    free: false,
    keyUrl: "https://platform.openai.com/api-keys",
    keyHint: "sk-…",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o mini · cheap" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
      { id: "gpt-4.1-nano", label: "GPT-4.1 nano" },
      { id: "o3", label: "o3 · reasoning" },
      { id: "o4-mini", label: "o4-mini · reasoning" },
      { id: "o3-mini", label: "o3-mini · reasoning" },
      { id: "gpt-4-turbo", label: "GPT-4 Turbo" },
      { id: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
    ],
    note: "Paid.",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    free: false,
    keyUrl: "https://platform.deepseek.com/api_keys",
    keyHint: "sk-…",
    models: [
      { id: "deepseek-chat", label: "DeepSeek V3 · chat" },
      { id: "deepseek-reasoner", label: "DeepSeek R1 · reasoning" },
    ],
    note: "Very cheap, strong reasoning (R1).",
  },
  {
    id: "xai",
    label: "xAI · Grok",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    free: false,
    keyUrl: "https://console.x.ai/",
    keyHint: "xai-…",
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-4-fast", label: "Grok 4 Fast" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 mini" },
      { id: "grok-2-vision-1212", label: "Grok 2 Vision" },
    ],
    note: "Paid. Grok family from xAI.",
  },
  {
    id: "together",
    label: "Together AI",
    kind: "openai",
    baseUrl: "https://api.together.xyz/v1",
    free: false,
    keyUrl: "https://api.together.xyz/settings/api-keys",
    keyHint: "…",
    models: [
      { id: "meta-llama/Llama-3.3-70B-Instruct-Turbo", label: "Llama 3.3 70B Turbo" },
      { id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo", label: "Llama 3.1 405B Turbo" },
      { id: "meta-llama/Llama-4-Scout-17B-16E-Instruct", label: "Llama 4 Scout" },
      { id: "Qwen/Qwen2.5-72B-Instruct-Turbo", label: "Qwen 2.5 72B" },
      { id: "deepseek-ai/DeepSeek-V3", label: "DeepSeek V3" },
      { id: "deepseek-ai/DeepSeek-R1", label: "DeepSeek R1" },
      { id: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B" },
    ],
    note: "Paid. A big catalogue of open models.",
  },
  {
    id: "perplexity",
    label: "Perplexity",
    kind: "openai",
    baseUrl: "https://api.perplexity.ai",
    free: false,
    keyUrl: "https://www.perplexity.ai/settings/api",
    keyHint: "pplx-…",
    models: [
      { id: "sonar", label: "Sonar" },
      { id: "sonar-pro", label: "Sonar Pro" },
      { id: "sonar-reasoning", label: "Sonar Reasoning" },
      { id: "sonar-reasoning-pro", label: "Sonar Reasoning Pro" },
      { id: "sonar-deep-research", label: "Sonar Deep Research" },
    ],
    note: "Paid, web-connected models (answers from your vault via the one-shot path).",
  },
];

export const getProvider = (id: string): Provider =>
  PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];

interface RawModel {
  id?: string;
  name?: string;
}

/**
 * Fetch the provider's COMPLETE live model list from its `/models` endpoint
 * (OpenAI-compatible for most; Anthropic uses its own auth headers).
 * Returns [] on failure so callers can fall back to the curated list.
 */
export async function fetchModels(p: Provider, apiKey: string): Promise<{ id: string; label: string }[]> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (p.kind === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  } else {
    headers["authorization"] = `Bearer ${apiKey || "local"}`;
    if (p.id === "openrouter") headers["HTTP-Referer"] = location.origin;
  }
  const res = await fetch(`${p.baseUrl}/models`, { headers });
  if (!res.ok) throw new Error(`${p.label} models ${res.status}`);
  const data = (await res.json()) as { data?: RawModel[]; models?: RawModel[] };
  const raw = data.data ?? data.models ?? [];
  // drop non-chat endpoints (embeddings / audio / image / moderation) the agent can't use
  const NON_CHAT = /embed|whisper|tts|dall-?e|moderation|rerank|stable-diffusion|flux|text-to|image-gen/i;
  const ids = raw
    .map((m) => (m.id ?? m.name ?? "").replace(/^models\//, "")) // Gemini prefixes ids with "models/"
    .filter((id) => id && !NON_CHAT.test(id));
  const uniq = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  return uniq.map((id) => ({ id, label: id }));
}
