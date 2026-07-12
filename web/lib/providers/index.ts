import { OpenAIRewriteProvider } from "./openai-rewrite-provider";
import type { RewriteEngine } from "../rewrite";

type ProviderName = "openai" | "gemini" | "deepseek" | "local";

const CONFIG: Record<
  ProviderName,
  { key: string; model: string; baseURL?: string }
> = {
  openai: { key: "OPENAI_API_KEY", model: "gpt-4.1-mini" },
  gemini: {
    key: "GEMINI_API_KEY",
    model: "gemini-2.5-flash",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  deepseek: {
    key: "DEEPSEEK_API_KEY",
    model: "deepseek-chat",
    baseURL: "https://api.deepseek.com",
  },
  local: {
    key: "LOCAL_LLM_API_KEY",
    model: "local-model",
    baseURL: "http://127.0.0.1:11434/v1",
  },
};

export function createRewriteEngine(): RewriteEngine {
  const name = (process.env.REWRITE_PROVIDER ?? process.env.TRANSLATION_PROVIDER ?? "openai").toLowerCase();

  if (!(name in CONFIG)) {
    throw new Error(`REWRITE_PROVIDER không được hỗ trợ: ${name}`);
  }

  const provider = name as ProviderName;
  const config = CONFIG[provider];
  const apiKey = process.env[config.key] ?? (provider === "local" ? "local" : "");

  if (!apiKey) {
    throw new Error(`Thiếu biến môi trường ${config.key}.`);
  }

  return new OpenAIRewriteProvider({
    provider,
    apiKey,
    model: process.env.REWRITE_MODEL ?? config.model,
    baseURL: process.env.REWRITE_BASE_URL ?? config.baseURL,
  });
}
