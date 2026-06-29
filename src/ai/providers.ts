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
    ],
    note: "Free, no credit card. Very fast. Best free pick.",
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
    ],
    note: "Generous free tier from Google AI Studio. Strong, and great at tool use.",
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
    ],
    note: "Routes to many models, several with a :free tier.",
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
      { id: "claude-sonnet-4-6", label: "Sonnet 4.6 · balanced" },
      { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 · fast" },
      { id: "claude-opus-4-8", label: "Opus 4.8 · deepest" },
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
      { id: "gpt-4o-mini", label: "GPT-4o mini · cheap" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
    note: "Paid.",
  },
];

export const getProvider = (id: string): Provider =>
  PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
