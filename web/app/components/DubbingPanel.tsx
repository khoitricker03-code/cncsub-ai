"use client";

import { useRef, useState } from "react";

import type { SubtitleSegment } from "@/lib/subtitles";

type DubbingPanelProps = {
  projectId: string;
  translatedSegments: SubtitleSegment[];
  language: string;
};

export default function DubbingPanel({
  projectId,
  translatedSegments,
  language,
}: DubbingPanelProps) {
  const [backgroundVolume, setBackgroundVolume] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const controllerRef = useRef<AbortController | null>(null);

  const generate = async () => {
    setLoading(true);
    setError("");
    controllerRef.current = new AbortController();
    try {
      const response = await fetch(`/api/projects/${projectId}/dub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segments: translatedSegments,
          language,
          backgroundVolume: backgroundVolume / 100,
        }),
        signal: controllerRef.current.signal,
      });
      const result = (await response.json()) as {
        success?: boolean;
        videoUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.success || !result.videoUrl) {
        throw new Error(result.error || "Không thể tạo video lồng tiếng.");
      }
      setVideoUrl(`${result.videoUrl}?v=${Date.now()}`);
    } catch (generateError) {
      if (generateError instanceof DOMException && generateError.name === "AbortError") return;
      setError(generateError instanceof Error ? generateError.message : "Không thể tạo video lồng tiếng.");
    } finally {
      setLoading(false);
      controllerRef.current = null;
    }
  };

  return (
    <section className="space-y-4 rounded-xl border border-purple-900/70 bg-gray-900 p-4">
      <div>
        <h2 className="font-semibold">AI Dubbing</h2>
        <p className="mt-1 text-sm text-gray-400">
          Tạo giọng nói từ phụ đề đã dịch và trộn với âm thanh nền gốc.
        </p>
      </div>
      <label className="block text-sm text-gray-300">
        Âm lượng nền: {backgroundVolume}%
        <input
          aria-label="Âm lượng nền"
          type="range"
          min={0}
          max={100}
          value={backgroundVolume}
          disabled={loading}
          onChange={(event) => setBackgroundVolume(Number(event.target.value))}
          className="mt-2 block w-full"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading || translatedSegments.length === 0}
          className="rounded-lg bg-purple-600 px-5 py-3 font-semibold hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Đang tạo giọng nói và render..." : "🎙️ Tạo video lồng tiếng"}
        </button>
        {loading ? (
          <button
            type="button"
            onClick={() => controllerRef.current?.abort()}
            className="rounded-lg bg-red-700 px-4 py-3 font-semibold"
          >
            Hủy
          </button>
        ) : null}
      </div>
      {translatedSegments.length === 0 ? (
        <p className="text-sm text-amber-300">Hãy dịch phụ đề trước khi tạo lồng tiếng.</p>
      ) : null}
      {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
      {videoUrl ? (
        <div className="space-y-2">
          <p role="status" className="text-sm text-green-300">Video lồng tiếng đã sẵn sàng.</p>
          <video
            key={videoUrl}
            src={videoUrl}
            controls
            autoPlay
            playsInline
            className="w-full rounded-lg bg-black"
          />
        </div>
      ) : null}
    </section>
  );
}
