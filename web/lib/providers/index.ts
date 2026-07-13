import { OpenAIRewriteProvider } from "./openai-rewrite-provider";
import { GeminiRewriteProvider } from "./gemini-rewrite-provider";
import type { RewriteEngine } from "../rewrite";

type ProviderName = "openai" | "gemini" | "deepseek" | "local";

function requireApiKey(name: string): string {
  const apiKey = process.env[name];

  if (!apiKey) {
    throw new Error(`Thiếu biến môi trường ${name}.`);
  }

  return apiKey;
}

export function createRewriteEngine(): RewriteEngine {
  const provider = (
    process.env.REWRITE_PROVIDER ??
    process.env.TRANSLATION_PROVIDER ??
    "openai"
  )
    .trim()
    .toLowerCase() as ProviderName;

  switch (provider) {
    case "gemini":
      return new GeminiRewriteProvider({
        apiKey: requireApiKey("GEMINI_API_KEY"),
        model: process.env.REWRITE_MODEL ?? "gemini-2.5-flash",
        baseURL: process.env.GEMINI_BASE_URL,
      });
    case "openai":
      return new OpenAIRewriteProvider({
        provider,
        apiKey: requireApiKey("OPENAI_API_KEY"),
        model: process.env.REWRITE_MODEL ?? "gpt-4.1-mini",
        baseURL: process.env.REWRITE_BASE_URL,
      });
    case "deepseek":
      return new OpenAIRewriteProvider({
        provider,
        apiKey: requireApiKey("DEEPSEEK_API_KEY"),
        model: process.env.REWRITE_MODEL ?? "deepseek-chat",
        baseURL: process.env.REWRITE_BASE_URL ?? "https://api.deepseek.com",
      });
    case "local": {
      const model =
        process.env.LOCAL_MODEL || process.env.REWRITE_MODEL || "qwen2.5:7b";
      console.info(`[rewrite] provider=local\nmodel=${model}`);
      return new OpenAIRewriteProvider({
        provider,
        apiKey: process.env.LOCAL_LLM_API_KEY ?? "local",
        model,
        baseURL: "http://127.0.0.1:11434/v1",
      });
    }
    default:
      throw new Error(`REWRITE_PROVIDER không được hỗ trợ: ${provider}`);
  }
}
