import OpenAI from "openai";

import { isValidTextTransform } from "../ai-validation";
import type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";

type OpenAICompatibleTranslatorOptions = {
  provider: string;
  apiKey: string;
  model: string;
  baseURL?: string;
};

export class OpenAICompatibleTranslator implements Translator {
  readonly provider: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options: OpenAICompatibleTranslatorOptions) {
    this.provider = options.provider;
    this.model = options.model;
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseURL,
    });
  }

  async translate(text: string, options: TranslationOptions): Promise<string> {
    const [translated] = await this.batchTranslate([{ id: 0, text }], options);
    return translated.text;
  }

  async detectLanguage(text: string, signal?: AbortSignal): Promise<string> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Detect the language of the text. Return only its ISO 639-1 language code.",
          },
          { role: "user", content: text.slice(0, 4000) },
        ],
      },
      { signal },
    );

    const code = response.choices[0]?.message.content?.trim().toLowerCase();

    if (!code || !/^[a-z]{2}$/.test(code)) {
      throw new Error("Không thể nhận diện ngôn ngữ nguồn.");
    }

    return code;
  }

  async batchTranslate(
    segments: TranslationInput[],
    options: TranslationOptions,
  ): Promise<TranslationInput[]> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You translate subtitle text. Return JSON only as {\"segments\":[{\"id\":number,\"text\":string}]}. Preserve every id, array order, item count, and the exact newline count inside each text. Preserve meaning, tone, and subtitle-friendly brevity. Never merge or split items.",
          },
          {
            role: "user",
            content: JSON.stringify({
              sourceLanguage: options.sourceLanguage ?? "auto-detect",
              targetLanguage: options.targetLanguage,
              segments,
            }),
          },
        ],
      },
      { signal: options.signal },
    );

    const content = response.choices[0]?.message.content;

    if (!content) {
      throw new Error("Nhà cung cấp dịch không trả về nội dung.");
    }

    const parsed: unknown = JSON.parse(content);
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
