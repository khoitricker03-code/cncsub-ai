"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { validateSegments, type SubtitleSegment } from "@/lib/subtitles";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "invalid" | "error";

type SaveResponse = {
  success: boolean;
  savedAt?: string;
  error?: string;
};

export function useSubtitleAutosave(
  projectId: string,
  segments: SubtitleSegment[],
  isDirty: boolean,
  onSaved: () => void,
  saveUrl = `/api/projects/${projectId}`,
) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState("");
  const activeRequest = useRef<AbortController | null>(null);

  const save = useCallback(async () => {
    const validationError = validateSegments(segments);

    if (validationError) {
      setStatus("invalid");
      setMessage(validationError);
      return false;
    }

    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setStatus("saving");
    setMessage("Đang lưu...");

    try {
      const response = await fetch(saveUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segments }),
        signal: controller.signal,
      });
      const result = (await response.json()) as SaveResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Không thể lưu phụ đề.");
      }

      setStatus("saved");
      setMessage(
        `Đã lưu ${new Date(result.savedAt ?? Date.now()).toLocaleTimeString()}`,
      );
      onSaved();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return false;
      }

      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Không thể lưu phụ đề.");
      return false;
    }
  }, [onSaved, saveUrl, segments]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const validationError = validateSegments(segments);

    if (validationError) {
      return;
    }

    const timeout = window.setTimeout(() => void save(), 900);

    return () => window.clearTimeout(timeout);
  }, [isDirty, save, segments]);

  useEffect(
    () => () => activeRequest.current?.abort(),
    [],
  );

  const validationError = validateSegments(segments);
  const visibleStatus = validationError
    ? "invalid"
    : isDirty && status !== "saving" && status !== "error"
      ? "dirty"
      : status;
  const visibleMessage = validationError
    ? validationError
    : visibleStatus === "dirty"
      ? "Có thay đổi chưa lưu"
      : message;

  return { status: visibleStatus, message: visibleMessage, save };
}
