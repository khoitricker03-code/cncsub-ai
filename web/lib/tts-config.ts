export type TTSProvider = "edge";

export type TTSOptions = {
  provider: TTSProvider;
  voice: string;
  rate: number;
  pitch: number;
  language: string;
};

export type DubbingOptions = TTSOptions & {
  originalVolume: number;
  retries: number;
};

export const EDGE_VOICES = [
  { language: "vi", locale: "vi-VN", value: "vi-VN-HoaiMyNeural", label: "Vietnamese — Hoai My" },
  { language: "vi", locale: "vi-VN", value: "vi-VN-NamMinhNeural", label: "Vietnamese — Nam Minh" },
  { language: "en", locale: "en-US", value: "en-US-JennyNeural", label: "English — Jenny" },
  { language: "en", locale: "en-US", value: "en-US-GuyNeural", label: "English — Guy" },
  { language: "zh", locale: "zh-CN", value: "zh-CN-XiaoxiaoNeural", label: "Simplified Chinese — Xiaoxiao" },
  { language: "zh", locale: "zh-CN", value: "zh-CN-YunxiNeural", label: "Simplified Chinese — Yunxi" },
  { language: "ja", locale: "ja-JP", value: "ja-JP-NanamiNeural", label: "Japanese — Nanami" },
  { language: "ja", locale: "ja-JP", value: "ja-JP-KeitaNeural", label: "Japanese — Keita" },
  { language: "ko", locale: "ko-KR", value: "ko-KR-SunHiNeural", label: "Korean — Sun Hi" },
  { language: "ko", locale: "ko-KR", value: "ko-KR-InJoonNeural", label: "Korean — In Joon" },
] as const;

const DEFAULT_VOICES: Record<string, string> = {
  vi: "vi-VN-HoaiMyNeural",
  en: "en-US-JennyNeural",
  zh: "zh-CN-XiaoxiaoNeural",
  ja: "ja-JP-NanamiNeural",
  ko: "ko-KR-SunHiNeural",
};

const VOICE_PATTERN = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+(?:Multilingual)?Neural$/;
const LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/;

function languageRoot(language?: string | null) {
  return (language || "en").trim().toLowerCase().replace("_", "-").split("-")[0];
}

export function getDefaultEdgeVoice(language?: string | null): string {
  return DEFAULT_VOICES[languageRoot(language)] ?? DEFAULT_VOICES.en;
}

function parseNumber(value: unknown, name: string, fallback: number, min: number, max: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}.`);
  }
  return parsed;
}

export function parseDubbingOptions(input: Record<string, unknown>): DubbingOptions {
  const provider = input.provider ?? "edge";
  if (provider !== "edge") {
    throw new Error(`Unsupported TTS provider: ${String(provider)}. AI Dubbing v1 supports only edge.`);
  }

  const language = typeof input.language === "string" && input.language.trim()
    ? input.language.trim()
    : "en";
  if (!LANGUAGE_PATTERN.test(language)) {
    throw new Error("language must be a valid language or locale code.");
  }

  const voice = typeof input.voice === "string" && input.voice.trim()
    ? input.voice.trim()
    : getDefaultEdgeVoice(language);
  if (!VOICE_PATTERN.test(voice)) {
    throw new Error("voice must be a valid Edge neural voice name.");
  }

  return {
    provider,
    voice,
    language,
    rate: parseNumber(input.rate, "rate", 0, -50, 100),
    pitch: parseNumber(input.pitch, "pitch", 0, -100, 100),
    originalVolume: parseNumber(input.originalVolume, "originalVolume", 0, 0, 1),
    retries: Math.round(parseNumber(input.retries, "retries", 2, 0, 5)),
  };
}

export function formatEdgeRate(rate: number) {
  const rounded = Math.round(rate);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

export function formatEdgePitch(pitch: number) {
  const rounded = Math.round(pitch);
  return `${rounded >= 0 ? "+" : ""}${rounded}Hz`;
}
