"use client";

import { useMemo, useRef, useState } from "react";

import { buildSrt, type SubtitleSegment } from "@/lib/subtitles";

type BurnButtonProps = {
  video?: File | null;
  videoUrl?: string;
  srtFilename: string;
  srtContent?: string;
  segments?: SubtitleSegment[];
  projectId?: string;
  onComplete?: (ok: boolean) => void;
};

type HardwareAcceleration = "auto" | "nvenc" | "software";

export default function BurnButton({
  video,
  videoUrl,
  srtFilename,
  srtContent,
  segments,
  projectId,
  onComplete,
}: BurnButtonProps) {
  const [loading, setLoading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [fontSize, setFontSize] = useState(42);
  const [position, setPosition] = useState(2);
  const [hardware, setHardware] = useState<HardwareAcceleration>("auto");
  const [error, setError] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const latestSrt = useMemo(
    () => srtContent ?? (segments ? buildSrt(segments) : ""),
    [segments, srtContent],
  );

  const loadVideo = async (signal: AbortSignal): Promise<File> => {
    if (video) return video;
    if (!videoUrl) throw new Error("Không tìm thấy video nguồn.");

    const response = await fetch(videoUrl, { signal });
    if (!response.ok) throw new Error("Không thể tải video nguồn để burn.");
    const blob = await response.blob();
    return new File([blob], "source-video.mp4", {
      type: blob.type || "video/mp4",
    });
  };

  const burnVideo = async () => {
    if (!latestSrt.trim()) {
      setError("Chưa có phụ đề để burn.");
      return;
    }

    setLoading(true);
    setError("");
    setDownloadProgress(0);
    controllerRef.current = new AbortController();

    try {
      const sourceVideo = await loadVideo(controllerRef.current.signal);
      const formData = new FormData();
      formData.append("video", sourceVideo);
      formData.append(
        "subtitle",
        new File([new Blob(["\uFEFF", latestSrt])], srtFilename, {
          type: "application/x-subrip",
        }),
      );
      formData.append("hardwareAcceleration", hardware);
      formData.append(
        "style",
        JSON.stringify({
          fontFamily: "Arial",
          fontSize,
          alignment: position,
          outline: 3,
          shadow: 1,
        }),
      );

      // If projectId is present, request persistence and poll job status.
      if (projectId) formData.append("projectId", projectId);

      const response = await fetch("/api/burn", {
        method: "POST",
        body: formData,
        signal: controllerRef.current.signal,
      });

      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(result?.error || "Burn subtitle thất bại.");
      }

      // If project-based, server returns JSON with jobId
      const maybeJson = await response.clone().json().catch(() => null) as unknown as { jobId?: string };

      if (projectId && maybeJson?.jobId) {
        const jobId = String(maybeJson.jobId);
        let finished = false;
        while (!finished) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const statusRes = await fetch(`/api/burn?jobId=${encodeURIComponent(jobId)}`);
            if (!statusRes.ok) continue;
            const statusJson = await statusRes.json().catch(() => null) as unknown as { success: boolean; status: string; progress: number; error: string | null };
            if (!statusJson?.success) continue;
            const { status, progress, error: jobError } = statusJson;
            setDownloadProgress(Math.max(0, Math.min(100, Number(progress ?? 0))));
            if (status === "completed") {
              finished = true;
              setDownloadProgress(100);
              setLoading(false);
              controllerRef.current = null;
              onComplete?.(true);
              return;
            }
            if (status === "failed") {
              finished = true;
              setError(jobError || "Burn failed.");
              setLoading(false);
              controllerRef.current = null;
              onComplete?.(false);
              return;
            }
          } catch {
            // ignore transient errors
          }
        }
      } else {
        // fallback: stream binary download
        if (!response.body) throw new Error("Máy chủ không trả về video.");

        const total = Number(response.headers.get("content-length") ?? 0);
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.byteLength;
          if (total > 0) {
            setDownloadProgress(
              Math.min(100, Math.round((received / total) * 100)),
            );
          }
        }

        const url = URL.createObjectURL(
          new Blob(chunks as BlobPart[], { type: "video/mp4" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = "video_final.mp4";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      }
    } catch (burnError) {
      if (burnError instanceof DOMException && burnError.name === "AbortError") {
        setError("Đã hủy tạo video.");
        onComplete?.(false);
        return;
      }
      setError(
        burnError instanceof Error ? burnError.message : "Không thể tạo video.",
      );
      onComplete?.(false);
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          Cỡ chữ{" "}
          <input
            className="w-16 rounded bg-gray-800 px-2 py-1"
            type="number"
            min={8}
            max={120}
            value={fontSize}
            onChange={(event) => setFontSize(Number(event.target.value))}
          />
        </label>

        <select
          aria-label="Vị trí phụ đề"
          value={position}
          onChange={(event) => setPosition(Number(event.target.value))}
          className="rounded bg-gray-800 px-2 py-1 text-sm"
        >
          <option value={8}>Trên</option>
          <option value={5}>Giữa</option>
          <option value={2}>Dưới</option>
        </select>

        <select
          aria-label="Bộ mã hóa"
          value={hardware}
          onChange={(event) =>
            setHardware(event.target.value as HardwareAcceleration)
          }
          className="rounded bg-gray-800 px-2 py-1 text-sm"
        >
          <option value="auto">GPU tự động</option>
          <option value="nvenc">NVIDIA NVENC</option>
          <option value="software">CPU</option>
        </select>

        <button
          type="button"
          onClick={() => void burnVideo()}
          disabled={loading || (!video && !videoUrl) || !latestSrt.trim()}
          className="rounded-lg bg-green-600 px-5 py-3 font-semibold transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Đang tạo video..." : "🎬 Tạo video có phụ đề"}
        </button>

        {loading && (
          <button
            type="button"
            onClick={() => controllerRef.current?.abort()}
            className="rounded-lg bg-red-700 px-3 py-3 font-semibold"
          >
            Hủy
          </button>
        )}
      </div>

      {loading && (
        <p className="text-sm text-gray-300">
          {downloadProgress > 0
            ? `Đang tải video ${downloadProgress}%`
            : "FFmpeg đang xử lý..."}
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
