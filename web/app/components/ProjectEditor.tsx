"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import SubtitleSegmentRow from "./SubtitleSegmentRow";
import VideoPlayer from "./VideoPlayer";
import { useSubtitleAutosave } from "@/app/hooks/useSubtitleAutosave";
import { useUndoRedo } from "@/app/hooks/useUndoRedo";
import {
  buildSrt,
  buildTranscript,
  validateSegments,
  type SubtitleSegment,
} from "@/lib/subtitles";

type OpenProjectResponse = {
  success: boolean;
  project?: {
    id: string;
    name: string;
    status: string;
    transcript: { language: string | null };
  };
  transcript?: string;
  segments?: SubtitleSegment[];
  error?: string;
};

function download(filename: string, content: string) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", content], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ProjectEditor({ projectId }: { projectId: string }) {
  const [data, setData] = useState<OpenProjectResponse | null>(null);
  const {
    value: segments,
    commit: commitSegments,
    reset: resetSegments,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useUndoRedo<SubtitleSegment[]>([], 20);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [seekVideo, setSeekVideo] = useState<(time: number) => void>(() => () => undefined);
  const markSaved = useCallback(() => setIsDirty(false), []);
  const handlePlayerReady = useCallback(
    (seek: (time: number) => void) => setSeekVideo(() => seek),
    [],
  );
  const { status, message, save } = useSubtitleAutosave(
    projectId,
    segments,
    isDirty,
    markSaved,
  );

  useEffect(() => {
    const controller = new AbortController();

    async function openProject() {
      try {
        const response = await fetch(`/api/projects/${projectId}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as OpenProjectResponse;

        if (!response.ok || !result.success || !Array.isArray(result.segments)) {
          throw new Error(result.error || "Không thể mở project.");
        }

        setData(result);
        resetSegments(result.segments);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }

        setError(
          loadError instanceof Error ? loadError.message : "Không thể mở project.",
        );
      }
    }

    void openProject();
    return () => controller.abort();
  }, [projectId, resetSegments]);

  const editedSrt = useMemo(() => buildSrt(segments), [segments]);
  const editedTranscript = useMemo(() => buildTranscript(segments), [segments]);
  const validationError = validateSegments(segments);
  const activeSegmentId =
    segments.find(
      (segment) => currentTime >= segment.start && currentTime < segment.end,
    )?.id ?? null;

  useEffect(() => {
    if (activeSegmentId === null) {
      return;
    }

    document
      .querySelector(`[data-segment-id="${activeSegmentId}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeSegmentId]);

  const updateSegment = (updated: SubtitleSegment) => {
    commitSegments((current) =>
      current.map((segment) =>
        segment.id === updated.id ? updated : segment,
      ),
    );
    setIsDirty(true);
  };

  const handleUndo = () => {
    if (canUndo) {
      undo();
      setIsDirty(true);
    }
  };

  const handleRedo = () => {
    if (canRedo) {
      redo();
      setIsDirty(true);
    }
  };

  const handleSave = async () => {
    if (await save()) {
      setIsDirty(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-red-300">
        {error}
      </div>
    );
  }

  if (!data?.project) {
    return (
      <div className="rounded-xl border border-gray-800 p-5 text-gray-300">
        Đang mở project...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">
            ← Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold">{data.project.name}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {segments.length} câu • {data.project.transcript.language ?? "unknown"}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-semibold hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Hoàn tác
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={!canRedo}
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-semibold hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Làm lại
          </button>
          <span
            className={[
              "rounded-full px-3 py-1 text-sm",
              status === "error" || status === "invalid"
                ? "bg-red-950 text-red-300"
                : status === "saved"
                  ? "bg-green-950 text-green-300"
                  : "bg-gray-800 text-gray-300",
            ].join(" ")}
            role="status"
          >
            {message || "Sẵn sàng"}
          </span>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={status === "saving" || Boolean(validationError)}
            className="rounded-lg bg-green-600 px-4 py-2 font-semibold hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === "saving" ? "Đang lưu..." : "Lưu"}
          </button>
          <button
            type="button"
            onClick={() => download("subtitle.srt", editedSrt)}
            className="rounded-lg bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700"
          >
            Tải SRT
          </button>
          <button
            type="button"
            onClick={() => download("transcript.txt", editedTranscript)}
            className="rounded-lg bg-gray-700 px-4 py-2 font-semibold hover:bg-gray-600"
          >
            Tải TXT
          </button>
        </div>
      </header>

      <details className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <summary className="cursor-pointer font-semibold">
          Transcript gốc đã lưu
        </summary>
        <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap text-sm text-gray-300">
          {data.transcript}
        </pre>
      </details>

      <VideoPlayer
        projectId={projectId}
        segments={segments}
        onTimeChange={setCurrentTime}
        onPlayerReady={handlePlayerReady}
        onSegmentChange={updateSegment}
      />

      <section className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
        {segments.map((segment, index) => (
          <SubtitleSegmentRow
            key={segment.id}
            index={index}
            segment={segment}
            onChange={updateSegment}
            onSeek={seekVideo}
            isActive={segment.id === activeSegmentId}
          />
        ))}
      </section>
    </div>
  );
}
