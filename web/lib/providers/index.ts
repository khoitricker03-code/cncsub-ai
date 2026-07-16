import { OllamaClient, getLocalAIConfig, getRewriteModel } from "../ai/ollama-client";
import { OllamaRewriteProvider } from "./ollama-rewrite-provider";
import type { RewriteEngine } from "../rewrite";

export function createRewriteEngine(): RewriteEngine {
  const provider = (
    process.env.REWRITE_PROVIDER ||
    process.env.TRANSLATION_PROVIDER ||
    "local"
  )
    .trim()
    .toLowerCase();

  if (provider !== "local" && provider !== "ollama") {
    throw new Error(
      `CNCSub AI đang chạy offline. REWRITE_PROVIDER phải là 'local', không phải '${provider}'.`,
    );
  }

  const config = getLocalAIConfig();
  const client = new OllamaClient({ ...config, model: getRewriteModel() });
  console.info(`[rewrite] provider=local model=${client.model}`);
  return new OllamaRewriteProvider(client);
}
