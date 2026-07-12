import { buildSrt, buildTranscript, type SubtitleSegment } from "./subtitles.ts";

export type SubtitleExportFormat = "srt" | "txt" | "json";

export function createSubtitleExport(
  segments: SubtitleSegment[],
  format: SubtitleExportFormat,
): string {
  if (format === "srt") {
    return buildSrt(segments);
  }

  if (format === "txt") {
    return buildTranscript(segments);
  }

  return JSON.stringify(segments, null, 2);
}

export function downloadSubtitleExport(
  filename: string,
  content: string,
  mimeType = "text/plain",
) {
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", content], { type: `${mimeType};charset=utf-8` }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
