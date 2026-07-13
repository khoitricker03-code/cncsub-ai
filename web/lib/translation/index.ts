import { ChatCompletionsTranslator } from "./chat-completions-translator";
import { GeminiTranslator } from "./gemini-translator";
import type { Translator } from "./translator";

type ProviderName = "openai" | "gemini" | "deepseek" | "local";

function requireApiKey(name: string): string {
  const apiKey = process.env[name];

  if (!apiKey) {
    throw new Error(`Thiếu biến môi trường ${name}.`);
  }

  return apiKey;
}

export function createTranslator(): Translator {
  const provider = (process.env.TRANSLATION_PROVIDER ?? "openai")
    .trim()
    .toLowerCase() as ProviderName;

  switch (provider) {
    case "gemini":
      return new GeminiTranslator({
        apiKey: requireApiKey("GEMINI_API_KEY"),
        model: process.env.GEMINI_TRANSLATION_MODEL ?? "gemini-2.5-flash",
        baseURL: process.env.GEMINI_BASE_URL,
      });
    case "openai":
      return new ChatCompletionsTranslator({
        provider,
        apiKey: requireApiKey("OPENAI_API_KEY"),
        model: process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-4.1-mini",
        baseURL: process.env.OPENAI_BASE_URL,
      });
    case "deepseek":
      return new ChatCompletionsTranslator({
        provider,
        apiKey: requireApiKey("DEEPSEEK_API_KEY"),
        model: process.env.DEEPSEEK_TRANSLATION_MODEL ?? "deepseek-chat",
        baseURL: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com",
      });
    case "local":
      return new ChatCompletionsTranslator({
        provider,
        apiKey: process.env.LOCAL_LLM_API_KEY ?? "local",
        model: process.env.LOCAL_TRANSLATION_MODEL ?? "local-model",
        baseURL: process.env.LOCAL_BASE_URL ?? "http://127.0.0.1:11434/v1",
      });
    default:
      throw new Error(`TRANSLATION_PROVIDER không được hỗ trợ: ${provider}`);
  }
}

export type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";
