import { OllamaClient, getTranslationModel } from "../ai/ollama-client";
import { OllamaTranslator } from "./ollama-translator";
import type { Translator } from "./translator";

type ProviderName = "local" | "ollama";

export function createTranslator(): Translator {
  const provider = (process.env.TRANSLATION_PROVIDER ?? "local")
    .trim()
    .toLowerCase() as ProviderName;

  switch (provider) {
    case "local":
    case "ollama": {
      const client = new OllamaClient({
        apiKey: process.env.LOCAL_LLM_API_KEY ?? "ollama",
        model: getTranslationModel(),
        baseURL: process.env.LOCAL_BASE_URL,
      });

      return new OllamaTranslator(client);
    }
    default:
      throw new Error(`TRANSLATION_PROVIDER không được hỗ trợ: ${provider}`);
  }
}

export type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";
