"use client";

import { useCallback, useRef, useState } from "react";

import type { SubtitleSegment } from "@/lib/subtitles";
import type { TranslationLanguageCode } from "@/lib/translation/languages";

type TranslationResponse = {
  success: boolean;
  segments?: SubtitleSegment[];
  error?: string;
};

const BATCH_SIZE = 10;

export function useTranslation(
  projectId: string,
  onComplete: (
    segments: SubtitleSegment[],
    targetLanguage: TranslationLanguageCode,
  ) => void,
) {
  const [progress, setProgress] = useState(0);
  const [isTranslating, setIsTranslating] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsTranslating(false);
  }, []);

  const translate = useCallback(
    async (
      sourceSegments: SubtitleSegment[],
      targetLanguage: TranslationLanguageCode,
    ) => {
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsTranslating(true);
      setProgress(0);
      setError("");

      try {
        const translated: SubtitleSegment[] = [];

        for (let index = 0; index < sourceSegments.length; index += BATCH_SIZE) {
          const batch = sourceSegments.slice(index, index + BATCH_SIZE);
          const response = await fetch(`/api/projects/${projectId}/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetLanguage, segments: batch }),
            signal: controller.signal,
          });
          const result = (await response.json()) as TranslationResponse;

          if (!response.ok || !result.success || !result.segments) {
            throw new Error(result.error || "Không thể dịch phụ đề.");
          }

          translated.push(...result.segments);
          setProgress(
            Math.round((Math.min(index + BATCH_SIZE, sourceSegments.length) / sourceSegments.length) * 90),
          );
        }

        const saveResponse = await fetch(`/api/projects/${projectId}/translate`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetLanguage, segments: translated }),
          signal: controller.signal,
        });
        const saveResult = (await saveResponse.json()) as TranslationResponse;

        if (!saveResponse.ok || !saveResult.success) {
          throw new Error(saveResult.error || "Không thể lưu bản dịch.");
        }

        setProgress(100);
        onComplete(translated, targetLanguage);
      } catch (translationError) {
        if (translationError instanceof DOMException && translationError.name === "AbortError") {
          return;
        }

        setError(
          translationError instanceof Error
            ? translationError.message
            : "Không thể dịch phụ đề.",
        );
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsTranslating(false);
        }
      }
    },
    [cancel, onComplete, projectId],
  );

  return { translate, cancel, progress, isTranslating, error };
}
