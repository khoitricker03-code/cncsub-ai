import OpenAI from "openai";

import { isValidTextTransform } from "../ai-validation";
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

type RewriteProviderOptions = {
  provider: string;
  apiKey: string;
  model: string;
  baseURL?: string;
};

export class OpenAIRewriteProvider implements RewriteEngine {
  readonly provider: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: RewriteProviderOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  async rewrite(
    text: string,
    mode: RewriteMode,
    signal?: AbortSignal,
  ): Promise<string> {
    const [result] = await this.batchRewrite([{ id: 0, text }], mode, signal);
    return result.text;
  }

  async batchRewrite(
    segments: RewriteInput[],
    mode: RewriteMode,
    signal?: AbortSignal,
  ): Promise<RewriteInput[]> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              `Rewrite subtitle text. ${MODE_INSTRUCTIONS[mode]} Return JSON only as {"segments":[{"id":number,"text":string}]}. Preserve every id, order, item count, language, meaning, and exact newline count. Never merge or split items.`,
          },
          { role: "user", content: JSON.stringify({ mode, segments }) },
        ],
      },
      { signal },
    );
    const content = response.choices[0]?.message.content;

    if (!content) {
      throw new Error("Rewrite provider không trả về nội dung.");
    }

    const parsed: unknown = JSON.parse(content);
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
