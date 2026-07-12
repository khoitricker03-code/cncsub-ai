export const TRANSLATION_LANGUAGES = [
  { code: "vi", name: "Vietnamese" },
  { code: "en", name: "English" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "th", name: "Thai" },
  { code: "id", name: "Indonesian" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
] as const;

export type TranslationLanguageCode =
  (typeof TRANSLATION_LANGUAGES)[number]["code"];

export function getTranslationLanguage(code: string) {
  return TRANSLATION_LANGUAGES.find((language) => language.code === code);
}
