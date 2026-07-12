import { OpenAICompatibleTranslator } from "./openai-compatible-translator";
import type { Translator } from "./translator";

type ProviderName = "openai" | "gemini" | "deepseek" | "local";

const PROVIDER_DEFAULTS: Record<
  ProviderName,
  { model: string; baseURL?: string; apiKeyEnv: string }
> = {
  openai: { model: "gpt-4.1-mini", apiKeyEnv: "OPENAI_API_KEY" },
  gemini: {
    model: "gemini-2.5-flash",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnv: "GEMINI_API_KEY",
  },
  deepseek: {
    model: "deepseek-chat",
    baseURL: "https://api.deepseek.com",
    apiKeyEnv: "DEEPSEEK_API_KEY",
  },
  local: {
    model: "local-model",
    baseURL: "http://127.0.0.1:11434/v1",
    apiKeyEnv: "LOCAL_LLM_API_KEY",
  },
};

export function createTranslator(): Translator {
  const configured = (process.env.TRANSLATION_PROVIDER ?? "openai").toLowerCase();

  if (!(configured in PROVIDER_DEFAULTS)) {
    throw new Error(`TRANSLATION_PROVIDER không được hỗ trợ: ${configured}`);
  }

  const provider = configured as ProviderName;
  const defaults = PROVIDER_DEFAULTS[provider];
  const prefix = provider.toUpperCase();
  const apiKey = process.env[defaults.apiKeyEnv] ?? (provider === "local" ? "local" : "");

  if (!apiKey) {
    throw new Error(`Thiếu biến môi trường ${defaults.apiKeyEnv}.`);
  }

  return new OpenAICompatibleTranslator({
    provider,
    apiKey,
    model: process.env[`${prefix}_TRANSLATION_MODEL`] ?? defaults.model,
    baseURL: process.env[`${prefix}_BASE_URL`] ?? defaults.baseURL,
  });
}

export type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";
