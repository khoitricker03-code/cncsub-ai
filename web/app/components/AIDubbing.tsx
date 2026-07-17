"use client";

import { useEffect, useRef, useState } from "react";

import {
  EDGE_VOICES,
  getDefaultEdgeVoice,
  type DubbingMode,
} from "@/lib/tts-config";

type Props = {
  projectId: string;
  language?: string | null;
  showDubbed: boolean;
  onPreviewChange: (dubbed: boolean) => void;
  onComplete?: (ok: boolean) => void;
};

type JobResponse = {
  success: boolean;
  status?: "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  phase?: string;
  error?: string | null;
};

type DemucsStatus = "checking" | "available" | "unavailable";

type CapabilitiesResponse = {
  demucs?: {
    available?: boolean;
    message?: string;
  };
};

export default function AIDubbing({
  projectId,
  language,
  showDubbed,
  onPreviewChange,
  onComplete,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [voice, setVoice] = useState(() => getDefaultEdgeVoice(language));
  const [rate, setRate] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [mode, setMode] = useState<DubbingMode>("replace-vocals");
  const [voiceVolume, setVoiceVolume] = useState(1);
  const [backgroundVolume, setBackgroundVolume] = useState(1);
  const [demucsStatus, setDemucsStatus] = useState<DemucsStatus>("checking");
  const [demucsMessage, setDemucsMessage] = useState("Checking Demucs availability...");
  const [hasDubbed, setHasDubbed] = useState(false);
  const jobRef = useRef<string | null>(null);
  const pollControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const loadCapabilities = async () => {
      try {
        const response = await fetch("/api/dub/capabilities", { signal: controller.signal });
        const capabilities = await response.json() as CapabilitiesResponse;
        const available = response.ok && capabilities.demucs?.available === true;
        setDemucsStatus(available ? "available" : "unavailable");
        setDemucsMessage(
          capabilities.demucs?.message
            ?? (available
              ? "Demucs is ready to preserve music and sound effects."
              : "Demucs is unavailable. Install it with: python -m pip install demucs"),
        );
        if (!available) setMode("replace-all");
      } catch (capabilitiesError) {
        if (capabilitiesError instanceof DOMException && capabilitiesError.name === "AbortError") return;
        setDemucsStatus("unavailable");
        setDemucsMessage("Demucs is unavailable. Install it with: python -m pip install demucs");
        setMode("replace-all");
      }
    };

    void loadCapabilities();
    return () => {
      controller.abort();
      pollControllerRef.current?.abort();
    };
  }, []);

  const stopPolling = () => {
    pollControllerRef.current?.abort();
    pollControllerRef.current = null;
  };

  const start = async () => {
    setLoading(true);
    setError("");
    setProgress(0);
    setPhase(mode === "replace-vocals" ? "Preparing vocal separation" : "Preparing Edge TTS");
    stopPolling();
    const pollController = new AbortController();
    pollControllerRef.current = pollController;

    try {
      const form = new FormData();
      form.append("projectId", projectId);
      form.append("provider", "edge");
      form.append("voice", voice);
      form.append("rate", String(rate));
      form.append("pitch", String(pitch));
      form.append("language", language || "en");
      form.append("mode", mode);
      form.append("voiceVolume", String(voiceVolume));
      form.append("backgroundVolume", String(backgroundVolume));

      const response = await fetch("/api/dub", { method: "POST", body: form });
      const created = await response.json() as { jobId?: string; error?: string };
      if (!response.ok || !created.jobId) {
        throw new Error(created.error ?? "Failed to start AI Dubbing.");
      }
      jobRef.current = created.jobId;

      while (!pollController.signal.aborted) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        const statusResponse = await fetch(
          `/api/dub?jobId=${encodeURIComponent(created.jobId)}`,
          { signal: pollController.signal },
        );
        if (!statusResponse.ok) continue;
        const job = await statusResponse.json() as JobResponse;
        setProgress(job.progress ?? 0);
        setPhase(job.phase ?? "");

        if (job.status === "completed") {
          setHasDubbed(true);
          setLoading(false);
          stopPolling();
          onPreviewChange(true);
          onComplete?.(true);
          return;
        }
        if (job.status === "failed") {
          throw new Error(job.error ?? "AI Dubbing failed.");
        }
        if (job.status === "cancelled") {
          setError("AI Dubbing was cancelled.");
          setLoading(false);
          stopPolling();
          onComplete?.(false);
          return;
        }
      }
    } catch (startError) {
      if (startError instanceof DOMException && startError.name === "AbortError") return;
      setError(startError instanceof Error ? startError.message : String(startError));
      setLoading(false);
      stopPolling();
      onComplete?.(false);
    }
  };

  const cancel = async () => {
    const jobId = jobRef.current;
    stopPolling();
    if (jobId) {
      await fetch(`/api/dub?jobId=${encodeURIComponent(jobId)}`, { method: "DELETE" }).catch(() => undefined);
    }
    setLoading(false);
    setPhase("cancelled");
    setError("AI Dubbing was cancelled.");
    onComplete?.(false);
  };

  const download = async () => {
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/video?rendered=true&revision=${Date.now()}`);
      if (!response.ok) throw new Error("Dubbed MP4 is not available.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "dubbed.mp4";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : String(downloadError));
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div>
        <h3 className="font-semibold">AI Dubbing</h3>
        <p className="text-sm text-gray-400">
          Demucs removes the original dialogue while keeping music and sound effects. Edge TTS then speaks the saved translation.
        </p>
      </div>

      <label className="block text-sm text-gray-300">
        Dubbing mode
        <select
          aria-label="Dubbing mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as DubbingMode)}
          disabled={loading || demucsStatus === "checking"}
          className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
        >
          <option value="replace-vocals" disabled={demucsStatus !== "available"}>
            Replace Voice Only — preserve music &amp; SFX
          </option>
          <option value="replace-all">Replace Entire Audio — AI voice only</option>
        </select>
      </label>

      {demucsStatus === "checking" && (
        <p className="text-sm text-gray-400" role="status">{demucsMessage}</p>
      )}
      {demucsStatus === "available" && (
        <p className="text-sm text-emerald-400">{demucsMessage}</p>
      )}
      {demucsStatus === "unavailable" && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200" role="alert">
          <p className="font-semibold">Replace Voice Only is disabled.</p>
          <p>{demucsMessage}</p>
          <p>You can still use Replace Entire Audio, which removes all original audio.</p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-gray-300">
          Voice
          <select
            aria-label="AI voice"
            value={voice}
            onChange={(event) => setVoice(event.target.value)}
            disabled={loading}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
          >
            {EDGE_VOICES.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm text-gray-300">
          AI voice volume: {Math.round(voiceVolume * 100)}%
          <input
            aria-label="AI voice volume"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={voiceVolume}
            onChange={(event) => setVoiceVolume(Number(event.target.value))}
            disabled={loading}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-gray-300">
          Background volume: {Math.round(backgroundVolume * 100)}%
          <input
            aria-label="Background volume"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={backgroundVolume}
            onChange={(event) => setBackgroundVolume(Number(event.target.value))}
            disabled={loading || mode === "replace-all"}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-gray-300">
          Speech rate: {rate >= 0 ? "+" : ""}{rate}%
          <input
            aria-label="Speech rate"
            type="range"
            min={-50}
            max={100}
            step={5}
            value={rate}
            onChange={(event) => setRate(Number(event.target.value))}
            disabled={loading}
            className="mt-2 w-full"
          />
        </label>

        <label className="text-sm text-gray-300">
          Pitch: {pitch >= 0 ? "+" : ""}{pitch} Hz
          <input
            aria-label="Speech pitch"
            type="range"
            min={-100}
            max={100}
            step={5}
            value={pitch}
            onChange={(event) => setPitch(Number(event.target.value))}
            disabled={loading}
            className="mt-2 w-full"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void start()}
          disabled={loading || demucsStatus === "checking"}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          {loading ? "Generating dubbed video…" : "Start AI Dubbing"}
        </button>
        {loading && (
          <button
            type="button"
            onClick={() => void cancel()}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-600"
          >
            Cancel
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPreviewChange(false)}
            className={`rounded-lg px-3 py-2 text-sm ${!showDubbed ? "bg-blue-600" : "bg-gray-700"}`}
          >
            Original
          </button>
          <button
            type="button"
            onClick={() => onPreviewChange(true)}
            disabled={!hasDubbed}
            className={`rounded-lg px-3 py-2 text-sm disabled:opacity-40 ${showDubbed ? "bg-blue-600" : "bg-gray-700"}`}
          >
            Dubbed
          </button>
          <button
            type="button"
            onClick={() => void download()}
            disabled={!hasDubbed}
            className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            Download MP4
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-1" role="status">
          <div className="h-2 overflow-hidden rounded bg-gray-800">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-sm text-gray-300">{phase || "Working"} — {progress}%</p>
        </div>
      )}
      {error && <p className="whitespace-pre-wrap text-sm text-red-400">Error: {error}</p>}
    </div>
  );
}
