"use client";

import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from "react";
import BurnButton from "./BurnButton";
import { useDropzone } from "react-dropzone";

type SubtitleSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type TranscribeResult = {
  success: boolean;
  filename?: string;
  textFilename?: string;
  language?: string;
  languageProbability?: number;
  text?: string;
  srt?: string;
  segments?: SubtitleSegment[];
  error?: string;
  projectId?: string;
};

function formatDisplayTime(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round(
    (safeSeconds - Math.floor(safeSeconds)) * 1000,
  );

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    secs.toString().padStart(2, "0"),
  ].join(":") + `.${milliseconds.toString().padStart(3, "0")}`;
}

function formatSrtTime(seconds: number): string {
  const totalMilliseconds = Math.max(
    0,
    Math.round(seconds * 1000),
  );

  const hours = Math.floor(totalMilliseconds / 3_600_000);
  const remainingAfterHours = totalMilliseconds % 3_600_000;

  const minutes = Math.floor(remainingAfterHours / 60_000);
  const remainingAfterMinutes = remainingAfterHours % 60_000;

  const secs = Math.floor(remainingAfterMinutes / 1000);
  const milliseconds = remainingAfterMinutes % 1000;

  return (
    `${hours.toString().padStart(2, "0")}:` +
    `${minutes.toString().padStart(2, "0")}:` +
    `${secs.toString().padStart(2, "0")},` +
    milliseconds.toString().padStart(3, "0")
  );
}
function wrapSubtitle(text: string, maxLength = 42): string {
  const words = text.trim().split(/\s+/);

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;

    if (next.length <= maxLength) {
      current = next;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join("\n");
}
function buildSrt(segments: SubtitleSegment[]): string {
  return segments
    .map((segment, index) => {
     const text = wrapSubtitle(segment.text);

      return [
        index + 1,
        `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
        text,
      ].join("\n");
    })
    .join("\n\n");
}

function buildTxt(segments: SubtitleSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");
}

function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob(["\uFEFF", content], {
    type: `${mimeType};charset=utf-8`,
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export type VideoUploaderHandle = {
  transcribeSelected: () => void;
  translateSelected: (sourceLanguage: string, targetLanguage: string) => Promise<void>;
};

type VideoUploaderProps = {
  onSelectionChange?: (hasSelection: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
};

const VideoUploader = forwardRef<VideoUploaderHandle, VideoUploaderProps>(function VideoUploader(
  { onSelectionChange, onBusyChange },
  ref,
) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [originalSegments, setOriginalSegments] = useState<SubtitleSegment[]>([]);
  const [translatedSegments, setTranslatedSegments] = useState<SubtitleSegment[]>([]);
  const [showingTranslation, setShowingTranslation] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [language, setLanguage] = useState("");
  const [srtFilename, setSrtFilename] =
    useState("subtitle.srt");
  const [txtFilename, setTxtFilename] =
    useState("subtitle.txt");

  const generatedSrt = useMemo(
    () => buildSrt(segments),
    [segments],
  );

  const generatedTxt = useMemo(
    () => buildTxt(segments),
    [segments],
  );

  const updateSegmentText = (
    segmentId: number,
    text: string,
  ) => {
    setSegments((currentSegments) =>
      currentSegments.map((segment) =>
        segment.id === segmentId
          ? {
              ...segment,
              text,
            }
          : segment,
      ),
    );
    const updateTrack = (currentSegments: SubtitleSegment[]) =>
      currentSegments.map((segment) =>
        segment.id === segmentId ? { ...segment, text } : segment,
      );
    if (showingTranslation) setTranslatedSegments(updateTrack);
    else setOriginalSegments(updateTrack);
  };

  const transcribeVideo = useCallback(async (file: File): Promise<TranscribeResult> => {
    setLoading(true);
    onBusyChange?.(true);
    setSegments([]);
    setLanguage("");
    setStatus("Đang tạo phụ đề bằng AI...");

    try {
      const formData = new FormData();
      formData.append("video", file);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as TranscribeResult;

      if (!response.ok || !result.success) {
        throw new Error(
          result.error || "Tạo phụ đề thất bại.",
        );
      }

      if (
        !Array.isArray(result.segments) ||
        result.segments.length === 0
      ) {
        throw new Error(
          "API không trả về danh sách phụ đề.",
        );
      }

      setSegments(result.segments);
      setOriginalSegments(result.segments);
      setTranslatedSegments([]);
      setShowingTranslation(false);
      setProjectId(result.projectId ?? null);
      setLanguage(result.language ?? "unknown");
      setSrtFilename(result.filename ?? "subtitle.srt");
      setTxtFilename(result.textFilename ?? "subtitle.txt");

      setStatus(
        `Hoàn thành — ${result.segments.length} câu, ngôn ngữ: ${
          result.language ?? "unknown"
        }`,
      );
      return result;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Có lỗi xảy ra.";

      setStatus(`Lỗi: ${message}`);
      setSegments([]);
      throw error;
    } finally {
      setLoading(false);
      onBusyChange?.(false);
    }
  }, [onBusyChange]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];

      if (!file) {
        return;
      }

      setSelectedFile(file);
      setStatus("");
      setSegments([]);
      setOriginalSegments([]);
      setTranslatedSegments([]);
      setShowingTranslation(false);
      setProjectId(null);
      setLanguage("");
      onSelectionChange?.(true);
    },
    [onSelectionChange],
  );

  useImperativeHandle(ref, () => ({
    transcribeSelected() {
      if (selectedFile && !loading) void transcribeVideo(selectedFile).catch(() => undefined);
    },
    async translateSelected(sourceLanguage, targetLanguage) {
      if (!selectedFile || loading) return;
      try {
        const transcription = projectId
          ? null
          : await transcribeVideo(selectedFile);
        const activeProjectId = projectId ?? transcription?.projectId;
        if (!activeProjectId) throw new Error("Không thể xác định project để dịch.");
        setLoading(true);
        onBusyChange?.(true);
        setStatus("Đang dịch phụ đề...");
        const response = await fetch(`/api/projects/${activeProjectId}/translate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceLanguage, targetLanguage }),
        });
        const result = (await response.json()) as TranscribeResult;
        if (!response.ok || !result.success || !result.segments?.length) {
          throw new Error(result.error || "Không thể dịch phụ đề.");
        }
        setSegments(result.segments);
        setTranslatedSegments(result.segments);
        setShowingTranslation(true);
        setStatus(`Dịch thành công — ${result.segments.length} câu.`);
      } catch (error) {
        setStatus(`Lỗi: ${error instanceof Error ? error.message : "Không thể dịch phụ đề."}`);
      } finally {
        setLoading(false);
        onBusyChange?.(false);
      }
    },
  }), [loading, onBusyChange, projectId, selectedFile, transcribeVideo]);

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    fileRejections,
  } = useDropzone({
    onDrop,
    accept: {
      "video/*": [],
      "audio/*": [],
    },
    multiple: false,
    disabled: loading,
    maxSize: 500 * 1024 * 1024,
  });

  const rejectionMessage =
    fileRejections.length > 0
      ? "File không hợp lệ hoặc lớn hơn 500 MB."
      : "";

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={[
          "cursor-pointer rounded-xl border-2 border-dashed p-12",
          "text-center transition",
          loading
            ? "cursor-not-allowed border-gray-700 opacity-60"
            : "border-gray-600 hover:border-blue-500",
        ].join(" ")}
      >
        <input {...getInputProps()} />

        {loading ? (
          <div className="space-y-2">
            <p className="text-lg font-semibold">
              Đang xử lý video...
            </p>
            <p className="text-sm text-gray-400">
              Không đóng trang cho tới khi hoàn tất.
            </p>
          </div>
        ) : isDragActive ? (
          <p>Thả video vào đây...</p>
        ) : (
          <div className="space-y-2">
            <p className="text-lg font-semibold">
              Kéo video vào hoặc bấm để chọn
            </p>
            <p className="text-sm text-gray-400">
              Video hoặc audio, tối đa 500 MB
            </p>
          </div>
        )}
      </div>

      {selectedFile && (
        <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
          <p className="text-sm text-gray-300">
            <span className="font-semibold">File:</span>{" "}
            {selectedFile.name}
          </p>

          <p className="mt-1 text-xs text-gray-500">
            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
          </p>
        </div>
      )}

      {rejectionMessage && (
        <p className="text-sm text-red-400">
          {rejectionMessage}
        </p>
      )}

      {status && (
        <p
          className={[
            "rounded-lg border p-3 text-sm",
            status.startsWith("Lỗi:")
              ? "border-red-900 bg-red-950/40 text-red-300"
              : "border-blue-900 bg-blue-950/40 text-blue-300",
          ].join(" ")}
        >
          {status}
        </p>
      )}

      {segments.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-col gap-3 border-b border-gray-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold">
                Chỉnh sửa phụ đề
              </h2>

              <p className="mt-1 text-sm text-gray-400">
                {segments.length} câu
                {language ? ` • Ngôn ngữ: ${language}` : ""}
              </p>
              {translatedSegments.length > 0 ? (
                <div className="mt-2 flex gap-2 text-xs">
                  <button type="button" onClick={() => { setSegments(originalSegments); setShowingTranslation(false); }} className={`rounded px-2 py-1 ${showingTranslation ? "bg-gray-700" : "bg-blue-700"}`}>Original</button>
                  <button type="button" onClick={() => { setSegments(translatedSegments); setShowingTranslation(true); }} className={`rounded px-2 py-1 ${showingTranslation ? "bg-purple-700" : "bg-gray-700"}`}>Translated</button>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    srtFilename,
                    generatedSrt,
                    "application/x-subrip",
                  )
                }
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-700"
              >
                Tải SRT
              </button>

              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    txtFilename,
                    generatedTxt,
                    "text/plain",
                  )
                }
                className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold transition hover:bg-gray-600"
              >
                Tải TXT
              </button>
            </div>
          </div>

          <div className="max-h-[600px] space-y-3 overflow-y-auto pr-1">
            {segments.map((segment, index) => (
              <article
                key={segment.id}
                className="rounded-xl border border-gray-800 bg-gray-950 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded bg-gray-800 px-2 py-1 text-xs font-semibold text-gray-300">
                    Câu {index + 1}
                  </span>

                  <span className="font-mono text-xs text-gray-500">
                    {formatDisplayTime(segment.start)}
                    {" → "}
                    {formatDisplayTime(segment.end)}
                  </span>
                </div>

                <textarea
                  value={segment.text}
                  onChange={(event) =>
                    updateSegmentText(
                      segment.id,
                      event.target.value,
                    )
                  }
                  rows={3}
                  className="w-full resize-y rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm leading-6 text-white outline-none transition focus:border-blue-500"
                  aria-label={`Nội dung câu phụ đề ${index + 1}`}
                />
              </article>
            ))}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-gray-800 pt-4">
            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  srtFilename,
                  generatedSrt,
                  "application/x-subrip",
                )
              }
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold transition hover:bg-blue-700"
            >
              Tải phụ đề SRT đã sửa
            </button>

            <button
              type="button"
              onClick={() =>
                downloadTextFile(
                  txtFilename,
                  generatedTxt,
                  "text/plain",
                )
              }
              className="rounded-lg bg-gray-700 px-5 py-3 font-semibold transition hover:bg-gray-600"
            >
              Tải nội dung TXT
            </button>
            <BurnButton
  video={selectedFile}
  srtFilename={srtFilename}
  segments={segments}
/>
          </div>
        </section>
      )}
    </div>
  );
});

export default VideoUploader;
