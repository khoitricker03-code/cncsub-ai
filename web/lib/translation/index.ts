import { OllamaClient, getLocalAIConfig, getTranslationModel } from "../ai/ollama-client";
import { OllamaTranslator } from "./ollama-translator";
import type { Translator } from "./translator";

export function createTranslator(): Translator {
  const provider = (process.env.TRANSLATION_PROVIDER || "local")
    .trim()
    .toLowerCase();

  if (provider !== "local" && provider !== "ollama") {
    throw new Error(
      `CNCSub AI đang chạy offline. TRANSLATION_PROVIDER phải là 'local', không phải '${provider}'.`,
    );
  }

  const config = getLocalAIConfig();
  const client = new OllamaClient({ ...config, model: getTranslationModel() });
  console.info(`[translation] provider=local model=${client.model}`);
  return new OllamaTranslator(client);
}

export type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";
