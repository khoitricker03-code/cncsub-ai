"use client";

import { useState, useRef } from "react";

type Props = { projectId: string; onComplete?: (ok: boolean) => void };

export default function AIDubbing({ projectId, onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const jobRef = useRef<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError("");
    setProgress(0);
    setPhase("Preparing...");

    try {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("provider", "edge");

      const res = await fetch("/api/dub", { method: "POST", body: form });
      if (!res.ok) throw new Error("Failed to start dubbing job");
      const json = await res.json();
      jobRef.current = json.jobId;

      // poll
      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        const status = await fetch(`/api/dub?jobId=${encodeURIComponent(jobRef.current!)}`);
        if (!status.ok) continue;
        const s = await status.json();
        setProgress(s.progress ?? 0);
        setPhase(s.phase ?? "");
        if (s.status === "completed") {
          setLoading(false);
          onComplete?.(true);
          break;
        }
        if (s.status === "failed") {
          setLoading(false);
          setError(s.error ?? "Dubbing failed");
          onComplete?.(false);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
      onComplete?.(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <h3 className="font-semibold">AI Dubbing</h3>
      <p className="text-sm text-gray-400">Synthesize translated subtitles into speech and produce dubbed MP4.</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={start}
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Đang chạy..." : "🎙️ Bắt đầu AI Dubbing"}
        </button>
        {loading && (
          <div className="text-sm text-gray-400">{phase} — {progress}%</div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-red-400">Lỗi: {error}</p>}
    </div>
  );
}
