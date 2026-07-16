"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useState,
} from "react";
import { useDropzone } from "react-dropzone";

import type { RewriteMode } from "@/lib/rewrite";

type SubtitleSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type ApiResult = {
  success: boolean;
  projectId?: string;
  language?: string;
  segments?: SubtitleSegment[];
  error?: string;
};

export type VideoUploaderHandle = {
  generateSubtitles: (options: {
    sourceLanguage: string;
    targetLanguage: string;
    rewriteMode?: RewriteMode;
  }) => Promise<void>;
};

type VideoUploaderProps = {
  onSelectionChange?: (hasSelection: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
};

const VideoUploader = forwardRef<VideoUploaderHandle, VideoUploaderProps>(
  function VideoUploader({ onSelectionChange, onBusyChange }, ref) {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [projectId, setProjectId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    const setBusy = useCallback(
      (value: boolean) => {
        setLoading(value);
        onBusyChange?.(value);
      },
      [onBusyChange],
    );

    const transcribe = useCallback(
      async (file: File): Promise<ApiResult> => {
        setStatus("Bước 1/3 — Whisper đang nhận diện lời nói...");
        const formData = new FormData();
        formData.append("video", file);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as ApiResult;

        if (!response.ok || !result.success || !result.projectId) {
          throw new Error(result.error || "Không thể tạo phụ đề gốc.");
        }
        setProjectId(result.projectId);
        return result;
      },
      [],
    );

    useImperativeHandle(
      ref,
      () => ({
        async generateSubtitles({
          sourceLanguage,
          targetLanguage,
          rewriteMode,
        }) {
          if (!selectedFile || loading) return;

          setBusy(true);
          try {
            const transcription = projectId
              ? null
              : await transcribe(selectedFile);
            const activeProjectId = projectId ?? transcription?.projectId;

            if (!activeProjectId) {
              throw new Error("Không thể xác định project vừa tạo.");
            }

            setStatus("Bước 2/3 — Ollama đang dịch phụ đề...");
            const translationResponse = await fetch(
              `/api/projects/${activeProjectId}/translate`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  sourceLanguage,
                  targetLanguage,
                  provider: "local",
                }),
              },
            );
            const translation = (await translationResponse.json()) as ApiResult;

            if (
              !translationResponse.ok ||
              !translation.success ||
              !translation.segments?.length
            ) {
              throw new Error(translation.error || "Không thể dịch phụ đề.");
            }

            let finalSegments = translation.segments;

            if (rewriteMode) {
              setStatus("Bước 3/3 — Ollama đang rewrite phụ đề...");
              const rewriteResponse = await fetch(
                `/api/projects/${activeProjectId}/rewrite`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ mode: rewriteMode, segments: finalSegments }),
                },
              );
              const rewritten = (await rewriteResponse.json()) as ApiResult;

              if (
                !rewriteResponse.ok ||
                !rewritten.success ||
                !rewritten.segments?.length
              ) {
                throw new Error(rewritten.error || "Không thể rewrite phụ đề.");
              }

              finalSegments = rewritten.segments;
              const saveResponse = await fetch(
                `/api/projects/${activeProjectId}/translate`,
                {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    sourceLanguage,
                    targetLanguage,
                    provider: "local",
                    segments: finalSegments,
                  }),
                },
              );

              if (!saveResponse.ok) {
                const saveResult = (await saveResponse.json().catch(() => null)) as
                  | ApiResult
                  | null;
                throw new Error(saveResult?.error || "Không thể lưu bản rewrite.");
              }
            }

            setStatus("Hoàn thành — đang mở trình chỉnh sửa...");
            window.location.assign(`/projects/${activeProjectId}`);
          } catch (error) {
            setStatus(
              `Lỗi: ${
                error instanceof Error ? error.message : "Không thể tạo phụ đề."
              }`,
            );
          } finally {
            setBusy(false);
          }
        },
      }),
      [loading, projectId, selectedFile, setBusy, transcribe],
    );

    const onDrop = useCallback(
      (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setSelectedFile(file);
        setProjectId(null);
        setStatus("Đã chọn video. Hãy chọn ngôn ngữ rồi bấm Tạo phụ đề.");
        onSelectionChange?.(true);
      },
      [onSelectionChange],
    );

    const { getRootProps, getInputProps, isDragActive, fileRejections } =
      useDropzone({
        onDrop,
        accept: { "video/*": [], "audio/*": [] },
        multiple: false,
        disabled: loading,
        maxSize: 500 * 1024 * 1024,
      });

    return (
      <div className="space-y-4">
        <div
          {...getRootProps()}
          className={[
            "cursor-pointer rounded-2xl border-2 border-dashed p-12 text-center transition",
            loading
              ? "cursor-not-allowed border-gray-700 opacity-60"
              : "border-gray-600 hover:border-blue-500 hover:bg-blue-950/10",
          ].join(" ")}
        >
          <input {...getInputProps()} />
          {loading ? (
            <div className="space-y-2">
              <p className="text-lg font-semibold">Đang xử lý video...</p>
              <p className="text-sm text-gray-400">Không đóng trang cho tới khi hoàn tất.</p>
            </div>
          ) : isDragActive ? (
            <p>Thả video vào đây...</p>
          ) : (
            <div className="space-y-2">
              <p className="text-lg font-semibold">Kéo video vào hoặc bấm để chọn</p>
              <p className="text-sm text-gray-400">Video hoặc audio, tối đa 500 MB</p>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="rounded-lg border border-gray-800 bg-gray-950 p-4">
            <p className="text-sm text-gray-300">
              <span className="font-semibold">File:</span> {selectedFile.name}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
        )}

        {fileRejections.length > 0 && (
          <p className="text-sm text-red-400">File không hợp lệ hoặc lớn hơn 500 MB.</p>
        )}

        {status && (
          <p
            role="status"
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
      </div>
    );
  },
);

export default VideoUploader;
