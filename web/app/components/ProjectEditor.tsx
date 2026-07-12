"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type SubtitleSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type OpenProjectResponse = {
  success: boolean;
  project?: {
    id: string;
    name: string;
    status: string;
    transcript: { language: string | null };
  };
  subtitle?: string;
  transcript?: string;
  segments?: SubtitleSegment[];
  error?: string;
};

function formatSrtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);
  const milliseconds = total % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(milliseconds).padStart(3, "0")}`;
}

function buildSrt(segments: SubtitleSegment[]): string {
  return segments
    .map((segment, index) =>
      [
        index + 1,
        `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
        segment.text.trim(),
      ].join("\n"),
    )
    .join("\n\n");
}

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
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [error, setError] = useState("");

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
        setSegments(result.segments);
      } catch (loadError) {
        if (loadError instanceof DOMException && loadError.name === "AbortError") {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "Không thể mở project.");
      }
    }

    void openProject();
    return () => controller.abort();
  }, [projectId]);

  const editedSrt = useMemo(() => buildSrt(segments), [segments]);
  const editedTranscript = useMemo(
    () => segments.map((segment) => segment.text.trim()).filter(Boolean).join("\n"),
    [segments],
  );

  if (error) {
    return <div className="rounded-xl border border-red-900 bg-red-950/40 p-5 text-red-300">{error}</div>;
  }

  if (!data?.project) {
    return <div className="rounded-xl border border-gray-800 p-5 text-gray-300">Đang mở project...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-blue-400 hover:text-blue-300">← Dashboard</Link>
          <h1 className="mt-2 text-3xl font-bold">{data.project.name}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {segments.length} câu • {data.project.transcript.language ?? "unknown"} • {data.project.status}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => download("subtitle.srt", editedSrt)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold hover:bg-blue-700">Tải SRT</button>
          <button onClick={() => download("transcript.txt", editedTranscript)} className="rounded-lg bg-gray-700 px-4 py-2 font-semibold hover:bg-gray-600">Tải TXT</button>
        </div>
      </div>

      <details className="rounded-xl border border-gray-800 bg-gray-900 p-4">
        <summary className="cursor-pointer font-semibold">Transcript gốc đã lưu</summary>
        <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap text-sm text-gray-300">{data.transcript}</pre>
      </details>

      <section className="space-y-3">
        {segments.map((segment, index) => (
          <article key={segment.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex justify-between gap-3 text-xs text-gray-400">
              <span>Câu {index + 1}</span>
              <span className="font-mono">{formatSrtTime(segment.start)} → {formatSrtTime(segment.end)}</span>
            </div>
            <textarea
              value={segment.text}
              onChange={(event) =>
                setSegments((current) =>
                  current.map((item) =>
                    item.id === segment.id ? { ...item, text: event.target.value } : item,
                  ),
                )
              }
              rows={3}
              className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 p-3 leading-6 outline-none focus:border-blue-500"
              aria-label={`Nội dung câu phụ đề ${index + 1}`}
            />
          </article>
        ))}
      </section>
    </div>
  );
}
