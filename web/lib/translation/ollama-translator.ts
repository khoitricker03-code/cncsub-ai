import { isValidTextTransform } from "../ai-validation.ts";
import { OllamaClient } from "../ai/ollama-client.ts";
import type {
  Translator,
  TranslationInput,
  TranslationOptions,
} from "./translator.ts";

function isRecoverableFormatError(error: unknown) {
  return error instanceof Error && /json|cấu trúc/i.test(error.message);
}

export class OllamaTranslator implements Translator {
  readonly provider = "local";
  readonly model: string;
  private readonly client: OllamaClient;

  constructor(client: OllamaClient) {
    this.client = client;
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
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const translated = await this.requestSegments(segments, options, attempt > 0);
        if (isValidTextTransform(segments, translated)) return translated;
      } catch (error) {
        if (options.signal?.aborted) throw error;
        if (!isRecoverableFormatError(error)) throw error;
      }
    }

    // A malformed batch must not fail the whole HTTP request. Isolate each
    // subtitle so one difficult item cannot invalidate all other translations.
    const translated: TranslationInput[] = [];
    for (const segment of segments) {
      let accepted: TranslationInput[] | null = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const candidate = await this.requestSegments([segment], options, true);
          if (isValidTextTransform([segment], candidate)) { accepted = candidate; break; }
        } catch (error) {
          if (options.signal?.aborted) throw error;
          if (!isRecoverableFormatError(error)) throw error;
        }
      }
      translated.push(accepted?.[0] ?? { ...segment });
    }
    return translated;
  }

  private async requestSegments(
    segments: TranslationInput[],
    options: TranslationOptions,
    strict: boolean,
  ): Promise<unknown> {
    const parsed = await this.client.chatJSON({
      system:
        'Translate subtitle text. Return JSON only as {"segments":[{"id":number,"text":string}]}. Preserve every numeric id, input order, item count, and exact newline count. Never merge, split, renumber, omit, or add items.' +
        (strict ? " This is a correction attempt: copy each id exactly and verify the segments array length before responding." : ""),
      user: JSON.stringify({
        sourceLanguage: options.sourceLanguage ?? "auto-detect",
        targetLanguage: options.targetLanguage,
        segments: segments.map((segment) => ({ ...segment, lineCount: segment.text.split("\n").length })),
      }),
      temperature: strict ? 0 : 0.2,
      signal: options.signal,
    });
    return parsed && typeof parsed === "object" && "segments" in parsed
      ? (parsed as { segments: unknown }).segments
      : null;
  }
}
