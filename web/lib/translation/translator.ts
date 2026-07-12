export type TranslationInput = {
  id: number;
  text: string;
};

export type TranslationOptions = {
  sourceLanguage?: string;
  targetLanguage: string;
  signal?: AbortSignal;
};

export interface Translator {
  readonly provider: string;
  translate(text: string, options: TranslationOptions): Promise<string>;
  detectLanguage(text: string, signal?: AbortSignal): Promise<string>;
  batchTranslate(
    segments: TranslationInput[],
    options: TranslationOptions,
  ): Promise<TranslationInput[]>;
}
