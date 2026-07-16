import { isValidTextTransform } from "../ai-validation";
import { OllamaClient } from "../ai/ollama-client";
import type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator";

export class OllamaTranslator implements Translator {
  readonly provider = "local";
  readonly model: string;

  constructor(private readonly client: OllamaClient) {
    this.model = client.model;
  }

  async translate(text: string, options: TranslationOptions): Promise<string> {
    const [translated] = await this.batchTranslate([{ id: 0, text }], options);
    return translated.text;
  }

  async detectLanguage(text: string, signal?: AbortSignal): Promise<string> {
    const parsed = await this.client.chatJSON({
      system:
        'Detect the language. Return JSON only as {"language":"ISO 639-1 code"}.',
      user: text.slice(0, 4000),
      temperature: 0,
      signal,
    });
    const code =
      parsed && typeof parsed === "object" && "language" in parsed
        ? String((parsed as { language: unknown }).language).toLowerCase()
        : "";

    if (!/^[a-z]{2}$/.test(code)) {
      throw new Error("Không thể nhận diện ngôn ngữ nguồn.");
    }

    return code;
  }

  async batchTranslate(
    segments: TranslationInput[],
    options: TranslationOptions,
  ): Promise<TranslationInput[]> {
    const parsed = await this.client.chatJSON({
      system:
        'Translate subtitle text. Return JSON only as {"segments":[{"id":number,"text":string}]}. Preserve every id, order, item count, meaning, and exact newline count. Never merge or split items.',
      user: JSON.stringify({
        sourceLanguage: options.sourceLanguage ?? "auto-detect",
        targetLanguage: options.targetLanguage,
        segments,
      }),
      temperature: 0.2,
      signal: options.signal,
    });
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
