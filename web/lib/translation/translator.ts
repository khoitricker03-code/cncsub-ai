export type TranslationInput = {
  id: number;
  text: string;
};

export interface Translator {
  readonly provider: string;
  translateBatch(
    segments: TranslationInput[],
    targetLanguage: string,
    signal?: AbortSignal,
  ): Promise<TranslationInput[]>;
}
