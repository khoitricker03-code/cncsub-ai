"use client";

import { useState } from "react";

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

      const response = await fetch("/api/burn", {
        method: "POST",
        body: formData,
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
      console.error(error);

      alert(
        error instanceof Error
          ? error.message
          : "Không thể tạo video."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={burnVideo}
      disabled={loading || !video}
      className="rounded-lg bg-green-600 px-5 py-3 font-semibold transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading
        ? "Đang tạo video..."
        : "🎬 Tạo video có phụ đề"}
    </button>
  );
}