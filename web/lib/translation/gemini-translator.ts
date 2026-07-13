import { GoogleGenAI } from "@google/genai";

import { isValidTextTransform } from "../ai-validation";
import type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";

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

type GeminiTranslatorOptions = {
  apiKey: string;
  model: string;
  client?: GoogleGenAI;
};

export class GeminiTranslator implements Translator {
  readonly provider = "gemini";
  private readonly client: GoogleGenAI;
  private readonly model: string;

  constructor(options: GeminiTranslatorOptions) {
  this.model = options.model;
  this.client =
    options.client ??
    new GoogleGenAI({
      apiKey: options.apiKey,
    });
}
  async translate(text: string, options: TranslationOptions): Promise<string> {
    const [translated] = await this.batchTranslate([{ id: 0, text }], options);
    return translated.text;
  }

 async detectLanguage(text: string, signal?: AbortSignal): Promise<string> {
  console.log("=== Gemini Translation ===");
  console.log("Model:", this.model);
  console.log("API key prefix:", process.env.GEMINI_API_KEY?.slice(0, 6));
console.log("===== Gemini Batch Translate =====");
console.log("MODEL =", this.model);
console.log("API KEY =", process.env.GEMINI_API_KEY?.slice(0, 8));

console.log("MODEL =", this.model);
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: text.slice(0, 4000),
      config: {
        abortSignal: signal,
        temperature: 0,
        systemInstruction:
          "Detect the language of the text. Return only its ISO 639-1 language code.",
      },
    });
    const code = response.text?.trim().toLowerCase();

    if (!code || !/^[a-z]{2}$/.test(code)) {
      throw new Error("Không thể nhận diện ngôn ngữ nguồn.");
    }

    return code;
  }

  async batchTranslate(
    segments: TranslationInput[],
    options: TranslationOptions,
  ): Promise<TranslationInput[]> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: JSON.stringify({
        sourceLanguage: options.sourceLanguage ?? "auto-detect",
        targetLanguage: options.targetLanguage,
        segments,
      }),
      config: {
        abortSignal: options.signal,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseJsonSchema: SEGMENTS_SCHEMA,
        systemInstruction:
          "Translate subtitle text. Preserve every id, array order, item count, and the exact newline count inside each text. Preserve meaning, tone, and subtitle-friendly brevity. Never merge or split items.",
      },
    });

    if (!response.text) {
      throw new Error("Gemini không trả về nội dung dịch.");
    }

    const parsed: unknown = JSON.parse(response.text);
    const translated =
      parsed && typeof parsed === "object" && "segments" in parsed
        ? (parsed as { segments: unknown }).segments
        : null;

    if (!isValidTextTransform(segments, translated)) {
      throw new Error("Kết quả dịch không giữ nguyên cấu trúc phụ đề.");
    }

    return translated as TranslationInput[];
  }
}
