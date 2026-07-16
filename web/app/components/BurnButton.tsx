"use client";

import { useRef, useState } from "react";

type BurnButtonProps = {
  video: File | null;
  srtFilename: string;
  srtContent: string;
};

export default function BurnButton({
  video,
  srtFilename,
  srtContent,
}: BurnButtonProps) {
  const [loading, setLoading] = useState(false);
  const [fontSize, setFontSize] = useState(42);
  const [position, setPosition] = useState(2);
  const [hardware, setHardware] = useState<"auto" | "nvenc" | "software">("auto");
  const controllerRef = useRef<AbortController | null>(null);

  const burnVideo = async () => {
    if (!video) {
      alert("Chưa có video.");
      return;
    }

    if (!srtContent.trim()) {
      alert("Chưa có phụ đề.");
      return;
    }

    setLoading(true);
    controllerRef.current = new AbortController();

    try {
      const formData = new FormData();

      formData.append("video", video);

      const subtitle = new File(
        [new Blob(["\uFEFF", srtContent])],
        srtFilename,
        {
          type: "application/x-subrip",
        },
      );

      formData.append("subtitle", subtitle);
      formData.append("hardwareAcceleration", hardware);
      formData.append("style", JSON.stringify({
        fontFamily: "Arial",
        fontSize,
        alignment: position,
        outline: 3,
        shadow: 1,
      }));

      const response = await fetch("/api/burn", {
        method: "POST",
        body: formData,
        signal: controllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error("Burn subtitle thất bại.");
      }
            const blob = await response.blob();

      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");

      link.href = url;
      link.download = "video_final.mp4";

      document.body.appendChild(link);

      link.click();

      link.remove();

      window.setTimeout(() => {
  URL.revokeObjectURL(url);
}, 1000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Không thể tạo video."
      );
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm">Cỡ chữ <input className="w-16 rounded bg-gray-800 px-2 py-1" type="number" min={8} max={120} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /></label>
      <select aria-label="Vị trí phụ đề" value={position} onChange={(event) => setPosition(Number(event.target.value))} className="rounded bg-gray-800 px-2 py-1 text-sm">
        <option value={8}>Trên</option><option value={5}>Giữa</option><option value={2}>Dưới</option>
      </select>
      <select aria-label="Bộ mã hóa" value={hardware} onChange={(event) => setHardware(event.target.value as typeof hardware)} className="rounded bg-gray-800 px-2 py-1 text-sm">
        <option value="auto">GPU tự động</option><option value="nvenc">NVIDIA NVENC</option><option value="software">CPU</option>
      </select>
      <button type="button" onClick={burnVideo} disabled={loading || !video} className="rounded-lg bg-green-600 px-5 py-3 font-semibold transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? "Đang tạo video..." : "🎬 Tạo video có phụ đề"}
      </button>
      {loading ? <button type="button" onClick={() => controllerRef.current?.abort()} className="rounded-lg bg-red-700 px-3 py-3 font-semibold">Hủy</button> : null}
    </div>
  );
}
