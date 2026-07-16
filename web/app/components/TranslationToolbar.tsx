"use client";

import { useState } from "react";

import { useTranslation } from "@/app/hooks/useTranslation";
import type { SubtitleSegment } from "@/lib/subtitles";
import {
  TRANSLATION_LANGUAGES,
  type TranslationLanguageCode,
} from "@/lib/translation/languages";

export type SubtitleTrack = "original" | "translation" | "both";

type TranslationToolbarProps = {
  projectId: string;
  originalSegments: SubtitleSegment[];
  hasTranslation: boolean;
  activeTrack: SubtitleTrack;
  onTrackChange: (track: SubtitleTrack) => void;
  onTranslationComplete: (
    segments: SubtitleSegment[],
    targetLanguage: TranslationLanguageCode,
  ) => void;
};

export default function TranslationToolbar({
  projectId,
  originalSegments,
  hasTranslation,
  activeTrack,
  onTrackChange,
  onTranslationComplete,
}: TranslationToolbarProps) {
  const [targetLanguage, setTargetLanguage] =
    useState<TranslationLanguageCode>("en");
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const {
    translate,
    cancel,
    retry,
    progress,
    isTranslating,
    isSuccess,
    error,
    failedSegmentIds,
  } = useTranslation(
    projectId,
    onTranslationComplete,
  );

  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-gray-950 p-1">
          {(["original", "translation", "both"] as const).map((track) => (
            <button
              key={track}
              type="button"
              disabled={track !== "original" && !hasTranslation}
              onClick={() => onTrackChange(track)}
              className={[
                "rounded-md px-4 py-2 text-sm font-semibold",
                activeTrack === track
                  ? "bg-blue-600 text-white"
                  : "text-gray-400 hover:text-white",
                track !== "original" && !hasTranslation
                  ? "cursor-not-allowed opacity-40"
                  : "",
              ].join(" ")}
            >
              {track === "original"
                ? "Original"
                : track === "translation"
                  ? "Translated"
                  : "Both"}
            </button>
          ))}
        </div>

        <select
          value={sourceLanguage}
          disabled={isTranslating}
          onChange={(event) => setSourceLanguage(event.target.value)}
          className="ml-auto rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
          aria-label="Source language"
        >
          <option value="auto">Auto detect</option>
          {TRANSLATION_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={isTranslating || sourceLanguage === "auto"}
          onClick={() => {
            const previousSource = sourceLanguage as TranslationLanguageCode;
            setSourceLanguage(targetLanguage);
            setTargetLanguage(previousSource);
          }}
          className="rounded-lg bg-gray-700 px-3 py-2 hover:bg-gray-600 disabled:opacity-40"
          aria-label="Swap languages"
        >
          ⇄
        </button>

        <select
          value={targetLanguage}
          disabled={isTranslating}
          onChange={(event) =>
            setTargetLanguage(event.target.value as TranslationLanguageCode)
          }
          className="rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
          aria-label="Target language"
        >
          {TRANSLATION_LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.name}
            </option>
          ))}
        </select>

        {isTranslating ? (
          <button
            type="button"
            onClick={cancel}
            className="rounded-lg bg-red-600 px-4 py-2 font-semibold hover:bg-red-700"
          >
            Hủy dịch
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              void translate(originalSegments, targetLanguage, sourceLanguage)
            }
            disabled={originalSegments.length === 0}
            className="rounded-lg bg-purple-600 px-4 py-2 font-semibold hover:bg-purple-700 disabled:opacity-50"
          >
            Translate
          </button>
        )}
      </div>

      {(isTranslating || progress > 0) && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-400">
            <span>Tiến trình dịch</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full bg-purple-500 transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-300">{error}</p>}
      {failedSegmentIds.length > 0 && (
        <p className="text-xs text-red-300">
          Câu lỗi: {failedSegmentIds.join(", ")}. Thử lại sẽ tiếp tục từ cache của các batch đã hoàn thành.
        </p>
      )}
      {error && !isTranslating && (
        <button
          type="button"
          onClick={retry}
          className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-semibold hover:bg-gray-600"
        >
          Thử lại
        </button>
      )}
      {isSuccess && !isTranslating && !error && (
        <p className="text-sm text-green-300">Dịch phụ đề thành công.</p>
      )}
    </section>
  );
}
