import { GoogleGenAI } from "@google/genai";

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

const SEGMENTS_SCHEMA = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          text: { type: "string" },
        },
        required: ["id", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["segments"],
  additionalProperties: false,
};

type GeminiRewriteProviderOptions = {
  apiKey: string;
  model: string;
  client?: GoogleGenAI;
};

export class GeminiRewriteProvider implements RewriteEngine {
  readonly provider = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: GeminiRewriteProviderOptions) {
    this.model = options.model;
    this.client =
      options.client ??
      new GoogleGenAI({
  apiKey: options.apiKey,
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
    console.log("=== Gemini Rewrite ===");
console.log("Model:", this.model);
console.log("Provider:", this.provider);
console.log("API Key:", process.env.GEMINI_API_KEY?.slice(0, 8));
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: JSON.stringify({ mode, segments }),
      config: {
        abortSignal: signal,
        temperature: 0.4,
        responseMimeType: "application/json",
        responseJsonSchema: SEGMENTS_SCHEMA,
        systemInstruction:
          `Rewrite subtitle text. ${MODE_INSTRUCTIONS[mode]} Preserve every id, order, item count, language, meaning, and exact newline count. Never merge or split items.`,
      },
    });

    if (!response.text) {
      throw new Error("Gemini không trả về nội dung rewrite.");
    }

    const parsed: unknown = JSON.parse(response.text);
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
