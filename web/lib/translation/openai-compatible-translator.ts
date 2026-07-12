import OpenAI from "openai";

import type { Translator, TranslationInput } from "./translator";

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

  async translateBatch(
    segments: TranslationInput[],
    targetLanguage: string,
    signal?: AbortSignal,
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
            content: JSON.stringify({ targetLanguage, segments }),
          },
        ],
      },
      { signal },
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

    if (
      !Array.isArray(translated) ||
      translated.length !== segments.length ||
      !translated.every(
        (item, index) =>
          item &&
          typeof item === "object" &&
          "id" in item &&
          "text" in item &&
          item.id === segments[index].id &&
          typeof item.text === "string" &&
          item.text.split("\n").length === segments[index].text.split("\n").length,
      )
    ) {
      throw new Error("Kết quả dịch không giữ nguyên cấu trúc phụ đề.");
    }

    return translated as TranslationInput[];
  }
}
