import { OllamaClient, getLocalAIConfig, getTranslationModel } from "../ai/ollama-client";
import { OllamaTranslator } from "./ollama-translator";
import type { Translator } from "./translator";
import { RemoteTranslator } from "./remote-translator";

export function createTranslator(selectedProvider?: string): Translator {
  const provider = (selectedProvider || process.env.TRANSLATION_PROVIDER || "local")
    .trim()
    .toLowerCase();

  if (provider === "openai" || provider === "gemini") return new RemoteTranslator(provider);
  if (provider !== "local" && provider !== "ollama") throw new Error(`Translation provider '${provider}' không hợp lệ.`);

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
