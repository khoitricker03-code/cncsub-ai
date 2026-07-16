import { isValidTextTransform } from "../ai-validation";
import { OllamaClient } from "../ai/ollama-client";
import type { RewriteEngine, RewriteInput, RewriteMode } from "../rewrite";

const MODE_INSTRUCTIONS: Record<RewriteMode, string> = {
  natural: "Make the text natural and fluent.",
  tiktok: "Make the text punchy, energetic, and TikTok-friendly.",
  youtube: "Make the text engaging and clear for a YouTube video.",
  netflix: "Make the text concise and polished like premium streaming subtitles.",
  formal: "Use a professional and formal tone.",
  short: "Shorten the text while preserving its meaning.",
  long: "Expand the text naturally without adding unsupported facts.",
  casual: "Use a relaxed, conversational tone.",
};

export class OllamaRewriteProvider implements RewriteEngine {
  readonly provider = "local";
  readonly model: string;

  constructor(private readonly client: OllamaClient) {
    this.model = client.model;
  }

  async rewrite(
    text: string,
    mode: RewriteMode,
    signal?: AbortSignal,
  ): Promise<string> {
    const [rewritten] = await this.batchRewrite([{ id: 0, text }], mode, signal);
    return rewritten.text;
  }

  async batchRewrite(
    segments: RewriteInput[],
    mode: RewriteMode,
    signal?: AbortSignal,
  ): Promise<RewriteInput[]> {
    const parsed = await this.client.chatJSON({
      system:
        `Rewrite subtitle text. ${MODE_INSTRUCTIONS[mode]} Return JSON only as {"segments":[{"id":number,"text":string}]}. Preserve every id, order, item count, language, meaning, and exact newline count. Never merge or split items.`,
      user: JSON.stringify({ mode, segments }),
      temperature: 0.4,
      signal,
    });
    const rewritten =
      parsed && typeof parsed === "object" && "segments" in parsed
        ? (parsed as { segments: unknown }).segments
        : null;

    if (!isValidTextTransform(segments, rewritten)) {
      throw new Error("Kết quả rewrite không giữ nguyên cấu trúc phụ đề.");
    }

    return rewritten as RewriteInput[];
  }
}
