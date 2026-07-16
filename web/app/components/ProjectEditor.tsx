"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import SubtitleSegmentRow from "./SubtitleSegmentRow";
import BilingualSubtitleList from "./BilingualSubtitleList";
import RewriteToolbar from "./RewriteToolbar";
import ExportMenu from "./ExportMenu";
import TranslationToolbar, { type SubtitleTrack } from "./TranslationToolbar";
import VideoPlayer from "./VideoPlayer";
import BurnButton from "./BurnButton";
import { useSubtitleAutosave } from "@/app/hooks/useSubtitleAutosave";
import { useUndoRedo } from "@/app/hooks/useUndoRedo";
import { useRewrite } from "@/app/hooks/useRewrite";
import {
  buildSrt,
  buildTranscript,
  validateSegments,
  type SubtitleSegment,
} from "@/lib/subtitles";
import type { TranslationLanguageCode } from "@/lib/translation/languages";
import type { RewriteMode } from "@/lib/rewrite";
import {
  addSegment,
  deleteSegment,
  duplicateSegment,
  mergeWithNext,
  splitSegment,
  type SegmentEditResult,
} from "@/lib/segment-editor";

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
  translatedSegments?: SubtitleSegment[] | null;
  translationLanguage?: string | null;
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
    value: originalSegments,
    commit: commitOriginalSegments,
    reset: resetOriginalSegments,
    undo: undoOriginal,
    redo: redoOriginal,
    canUndo: canUndoOriginal,
    canRedo: canRedoOriginal,
  } = useUndoRedo<SubtitleSegment[]>([], 20);
  const {
    value: translatedSegments,
    commit: commitTranslatedSegments,
    reset: resetTranslatedSegments,
    undo: undoTranslation,
    redo: redoTranslation,
    canUndo: canUndoTranslation,
    canRedo: canRedoTranslation,
  } = useUndoRedo<SubtitleSegment[]>([], 20);
  const [activeTrack, setActiveTrack] = useState<SubtitleTrack>("original");
  const [translationLanguage, setTranslationLanguage] = useState("unknown");
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>("natural");
  const [isDirty, setIsDirty] = useState(false);
  const [isTranslationDirty, setIsTranslationDirty] = useState(false);
  const [error, setError] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekVideo, setSeekVideo] = useState<(time: number) => void>(() => () => undefined);
  const markSaved = useCallback(() => setIsDirty(false), []);
  const markTranslationSaved = useCallback(
    () => setIsTranslationDirty(false),
    [],
  );
  const handlePlayerReady = useCallback(
    (seek: (time: number) => void) => setSeekVideo(() => seek),
    [],
  );
  const { status, message, save } = useSubtitleAutosave(
    projectId,
    originalSegments,
    isDirty,
    markSaved,
  );
  const translationSaveUrl = `/api/projects/${projectId}?track=translation&language=${encodeURIComponent(translationLanguage)}`;
  const {
    status: translationStatus,
    message: translationSaveMessage,
    save: saveTranslation,
  } = useSubtitleAutosave(
    projectId,
    translatedSegments,
    isTranslationDirty,
    markTranslationSaved,
    translationSaveUrl,
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
        resetOriginalSegments(result.segments);
        setSelectedSegmentId(result.segments[0]?.id ?? null);

        if (Array.isArray(result.translatedSegments)) {
          resetTranslatedSegments(result.translatedSegments);
          setTranslationLanguage(result.translationLanguage ?? "unknown");
        }
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
  }, [projectId, resetOriginalSegments, resetTranslatedSegments]);

  const activeSourceTrack: "original" | "translation" =
    activeTrack === "both" ? "translation" : activeTrack;
  const segments =
    activeSourceTrack === "translation" && translatedSegments.length > 0
      ? translatedSegments
      : originalSegments;
  const activeStatus =
    activeSourceTrack === "translation" ? translationStatus : status;
  const activeMessage =
    activeSourceTrack === "translation" ? translationSaveMessage : message;

  const handleRewriteComplete = useCallback(
    (rewritten: SubtitleSegment[]) => {
      const rewrittenById = new Map(
        rewritten.map((segment) => [segment.id, segment.text]),
      );
      const commit =
        activeTrack === "translation"
          ? commitTranslatedSegments
          : commitOriginalSegments;

      commit((current) =>
        current.map((segment) =>
          rewrittenById.has(segment.id)
            ? { ...segment, text: rewrittenById.get(segment.id) ?? segment.text }
            : segment,
        ),
      );

      if (activeTrack === "translation") {
        setIsTranslationDirty(true);
      } else {
        setIsDirty(true);
      }
    },
    [activeTrack, commitOriginalSegments, commitTranslatedSegments],
  );
  const {
    rewrite,
    cancel: cancelRewrite,
    progress: rewriteProgress,
    isRewriting,
    error: rewriteError,
    retry: retryRewrite,
    failedSegmentIds: rewriteFailedSegmentIds,
  } = useRewrite(projectId, handleRewriteComplete);

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
    const commit =
      activeTrack === "translation"
        ? commitTranslatedSegments
        : commitOriginalSegments;

    commit((current) =>
      current.map((segment) =>
        segment.id === updated.id ? updated : segment,
      ),
    );
    setSelectedSegmentId(updated.id);

    if (activeTrack === "translation") {
      setIsTranslationDirty(true);
    } else {
      setIsDirty(true);
    }
  };

  const updateOriginalSegment = (updated: SubtitleSegment) => {
    commitOriginalSegments((current) =>
      current.map((segment) => (segment.id === updated.id ? updated : segment)),
    );
    setIsDirty(true);
  };

  const updateTranslatedSegment = (updated: SubtitleSegment) => {
    commitTranslatedSegments((current) =>
      current.map((segment) => (segment.id === updated.id ? updated : segment)),
    );
    setIsTranslationDirty(true);
  };

  const handleTranslationComplete = useCallback(
    (
      translated: SubtitleSegment[],
      targetLanguage: TranslationLanguageCode,
    ) => {
      resetTranslatedSegments(translated);
      setTranslationLanguage(targetLanguage);
      setIsTranslationDirty(false);
      setActiveTrack("translation");
    },
    [resetTranslatedSegments],
  );

  const handleUndo = useCallback(() => {
    if (activeTrack === "translation" && canUndoTranslation) {
      undoTranslation();
      setIsTranslationDirty(true);
    } else if (activeTrack === "original" && canUndoOriginal) {
      undoOriginal();
      setIsDirty(true);
    }
  }, [activeTrack, canUndoOriginal, canUndoTranslation, undoOriginal, undoTranslation]);

  const handleRedo = useCallback(() => {
    if (activeTrack === "translation" && canRedoTranslation) {
      redoTranslation();
      setIsTranslationDirty(true);
    } else if (activeTrack === "original" && canRedoOriginal) {
      redoOriginal();
      setIsDirty(true);
    }
  }, [activeTrack, canRedoOriginal, canRedoTranslation, redoOriginal, redoTranslation]);

  const handleSave = useCallback(async () => {
    if (activeTrack === "translation") {
      if (await saveTranslation()) {
        setIsTranslationDirty(false);
      }
    } else if (await save()) {
      setIsDirty(false);
    }
  }, [activeTrack, save, saveTranslation]);

  const commitStructuralEdit = useCallback(
    (result: SegmentEditResult) => {
      if (result.error) {
        setEditNotice(result.error);
        return;
      }

      const commit =
        activeTrack === "translation"
          ? commitTranslatedSegments
          : commitOriginalSegments;
      commit(result.segments);
      setSelectedSegmentId(result.selectedId);
      setEditNotice("");

      if (activeTrack === "translation") setIsTranslationDirty(true);
      else setIsDirty(true);
    },
    [activeTrack, commitOriginalSegments, commitTranslatedSegments],
  );

  const selectedId = selectedSegmentId ?? activeSegmentId;
  const handleAddSegment = useCallback(
    () => commitStructuralEdit(addSegment(segments, currentTime)),
    [commitStructuralEdit, currentTime, segments],
  );
  const handleSplitSegment = useCallback(() => {
    if (selectedId === null) {
      setEditNotice("Hãy chọn một câu để tách.");
      return;
    }
    commitStructuralEdit(splitSegment(segments, selectedId, currentTime));
  }, [commitStructuralEdit, currentTime, segments, selectedId]);
  const handleMergeSegment = useCallback(() => {
    if (selectedId === null) {
      setEditNotice("Hãy chọn một câu để gộp.");
      return;
    }
    commitStructuralEdit(mergeWithNext(segments, selectedId));
  }, [commitStructuralEdit, segments, selectedId]);
  const handleDuplicateSegment = useCallback(() => {
    if (selectedId === null) {
      setEditNotice("Hãy chọn một câu để nhân bản.");
      return;
    }
    commitStructuralEdit(duplicateSegment(segments, selectedId));
  }, [commitStructuralEdit, segments, selectedId]);
  const handleDeleteSegment = useCallback(() => {
    if (selectedId === null) {
      setEditNotice("Hãy chọn một câu để xóa.");
      return;
    }
    commitStructuralEdit(deleteSegment(segments, selectedId));
  }, [commitStructuralEdit, segments, selectedId]);

  const canUndo =
    activeTrack === "translation" ? canUndoTranslation : canUndoOriginal;
  const canRedo =
    activeTrack === "translation" ? canRedoTranslation : canRedoOriginal;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editingText =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      } else if (modifier && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
      } else if (modifier && event.key.toLowerCase() === "y") {
        event.preventDefault();
        handleRedo();
      } else if (!editingText && modifier && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handleDuplicateSegment();
      } else if (!editingText && modifier && event.key === "Enter") {
        event.preventDefault();
        handleSplitSegment();
      } else if (!editingText && (event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        handleDeleteSegment();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleDeleteSegment,
    handleDuplicateSegment,
    handleRedo,
    handleSave,
    handleSplitSegment,
    handleUndo,
  ]);

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
              activeStatus === "error" || activeStatus === "invalid"
                ? "bg-red-950 text-red-300"
                : activeStatus === "saved"
                  ? "bg-green-950 text-green-300"
                  : "bg-gray-800 text-gray-300",
            ].join(" ")}
            role="status"
          >
            {activeMessage || "Sẵn sàng"}
          </span>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={activeStatus === "saving" || Boolean(validationError)}
            className="rounded-lg bg-green-600 px-4 py-2 font-semibold hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {activeStatus === "saving" ? "Đang lưu..." : "Lưu"}
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

      <TranslationToolbar
        projectId={projectId}
        originalSegments={originalSegments}
        hasTranslation={translatedSegments.length > 0}
        activeTrack={activeTrack}
        onTrackChange={setActiveTrack}
        onTranslationComplete={handleTranslationComplete}
      />

      <RewriteToolbar
        mode={rewriteMode}
        progress={rewriteProgress}
        isRewriting={isRewriting}
        error={rewriteError}
        onModeChange={setRewriteMode}
        onRewriteAll={() => void rewrite(segments, rewriteMode)}
        onCancel={cancelRewrite}
        onRetry={retryRewrite}
        failedSegmentIds={rewriteFailedSegmentIds}
      />

      <ExportMenu
        originalSegments={originalSegments}
        translatedSegments={translatedSegments}
        onImport={(imported) => {
          commitOriginalSegments(imported);
          setIsDirty(true);
          setSelectedSegmentId(imported[0]?.id ?? null);
        }}
      />

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 font-semibold">Burn track đang chỉnh sửa</h2>
        <p className="mb-3 text-sm text-gray-400">
          Video xuất ra luôn dùng đúng phụ đề hiện tại: {activeSourceTrack === "translation" ? "bản dịch" : "bản gốc"}.
        </p>
        <BurnButton
          videoUrl={`/api/projects/${projectId}/video`}
          srtFilename={
            activeSourceTrack === "translation" ? "translated.srt" : "subtitle.srt"
          }
          segments={segments}
        />
      </section>

      <details className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <summary className="cursor-pointer font-semibold">
          Transcript gốc đã lưu
        </summary>
        <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap text-sm text-gray-300">
          {data.transcript}
        </pre>
      </details>

      <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 text-sm font-semibold text-gray-300">
            Chỉnh cấu trúc
          </span>
          {[
            ["Thêm tại playhead", handleAddSegment],
            ["Tách tại playhead", handleSplitSegment],
            ["Gộp câu kế", handleMergeSegment],
            ["Nhân bản", handleDuplicateSegment],
            ["Xóa", handleDeleteSegment],
          ].map(([label, action]) => (
            <button
              key={label as string}
              type="button"
              onClick={action as () => void}
              disabled={activeTrack === "both"}
              className="rounded-lg bg-gray-700 px-3 py-2 text-sm hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {label as string}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Ctrl/Cmd+S lưu • Ctrl/Cmd+Z/Y hoàn tác/làm lại • Ctrl/Cmd+Enter tách • Ctrl/Cmd+D nhân bản • Delete xóa
        </p>
        {activeTrack === "both" && (
          <p className="mt-2 text-sm text-amber-300">
            Chọn Original hoặc Translation để chỉnh cấu trúc.
          </p>
        )}
        {editNotice && <p className="mt-2 text-sm text-amber-300">{editNotice}</p>}
      </section>

      <VideoPlayer
        projectId={projectId}
        segments={segments}
        onTimeChange={setCurrentTime}
        onPlayerReady={handlePlayerReady}
        onSegmentChange={updateSegment}
      />

      {activeTrack === "both" ? (
        <BilingualSubtitleList
          originalSegments={originalSegments}
          translatedSegments={translatedSegments}
          activeSegmentId={activeSegmentId}
          onOriginalChange={updateOriginalSegment}
          onTranslationChange={updateTranslatedSegment}
          onSeek={seekVideo}
        />
      ) : (
        <section className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
          {segments.map((segment, index) => (
            <SubtitleSegmentRow
              key={segment.id}
              index={index}
              segment={segment}
              onChange={updateSegment}
              onSeek={seekVideo}
              isActive={segment.id === activeSegmentId}
              isSelected={segment.id === selectedSegmentId}
              onSelect={setSelectedSegmentId}
              onRewrite={(item) => void rewrite([item], rewriteMode)}
              isRewriting={isRewriting}
            />
          ))}
        </section>
      )}
    </div>
  );
}
