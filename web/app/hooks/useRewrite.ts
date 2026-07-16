"use client";

import { useCallback, useRef, useState } from "react";

import type { RewriteMode } from "@/lib/rewrite";
import type { SubtitleSegment } from "@/lib/subtitles";

type RewriteResponse = {
  success: boolean;
  segments?: SubtitleSegment[];
  error?: string;
};

const BATCH_SIZE = 10;

export function useRewrite(
  projectId: string,
  onComplete: (segments: SubtitleSegment[]) => void,
) {
  const [progress, setProgress] = useState(0);
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState("");
  const [failedSegmentIds, setFailedSegmentIds] = useState<number[]>([]);
  const lastRequest = useRef<{ segments: SubtitleSegment[]; mode: RewriteMode } | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsRewriting(false);
  }, []);

  const rewrite = useCallback(
    async (segments: SubtitleSegment[], mode: RewriteMode) => {
      cancel();
      const controller = new AbortController();
      controllerRef.current = controller;
      setIsRewriting(true);
      setProgress(0);
      setError("");
      setFailedSegmentIds([]);
      lastRequest.current = { segments, mode };

      try {
        const output: SubtitleSegment[] = [];

        for (let index = 0; index < segments.length; index += BATCH_SIZE) {
          const batch = segments.slice(index, index + BATCH_SIZE);
          const response = await fetch(`/api/projects/${projectId}/rewrite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mode, segments: batch }),
            signal: controller.signal,
          });
          const result = (await response.json()) as RewriteResponse;

          if (!response.ok || !result.success || !result.segments) {
            setFailedSegmentIds(batch.map((segment) => segment.id));
            throw new Error(result.error || "Không thể rewrite phụ đề.");
          }

          output.push(...result.segments);
          setProgress(
            Math.round((Math.min(index + BATCH_SIZE, segments.length) / segments.length) * 100),
          );
        }

        onComplete(output);
      } catch (rewriteError) {
        if (rewriteError instanceof DOMException && rewriteError.name === "AbortError") {
          return;
        }

        setError(
          rewriteError instanceof Error
            ? rewriteError.message
            : "Không thể rewrite phụ đề.",
        );
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setIsRewriting(false);
        }
      }
    },
    [cancel, onComplete, projectId],
  );

  const retry = useCallback(() => {
    const request = lastRequest.current;
    if (request) void rewrite(request.segments, request.mode);
  }, [rewrite]);

  return { rewrite, cancel, retry, progress, isRewriting, error, failedSegmentIds };
}
