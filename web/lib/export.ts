import { buildSrt, buildTranscript, type SubtitleSegment } from "./subtitles.ts";

export type SubtitleExportFormat = "srt" | "vtt" | "ass" | "txt" | "json";

function timestamp(seconds: number, separator: "." | ",") {
  const value = Math.max(0, seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = Math.floor(value % 60);
  const millis = Math.round((value - Math.floor(value)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(millis).padStart(3, "0")}`;
}

function buildVtt(segments: SubtitleSegment[]) {
  return `WEBVTT\n\n${segments.map((segment) => `${segment.id}\n${timestamp(segment.start, ".")} --> ${timestamp(segment.end, ".")}\n${segment.text}`).join("\n\n")}\n`;
}

function buildAss(segments: SubtitleSegment[]) {
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,54,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,3,1,2,40,40,50,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const events = segments.map((segment) => `Dialogue: 0,${timestamp(segment.start, ".").slice(1, -1)},${timestamp(segment.end, ".").slice(1, -1)},Default,,0,0,0,,${segment.text.replace(/\n/g, "\\N")}`).join("\n");
  return `${header}${events}\n`;
}

function parseTimestamp(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":").map(Number);
  if (parts.some(Number.isNaN) || parts.length < 2 || parts.length > 3) throw new Error(`Invalid timestamp: ${value}`);
  const [hours, minutes, seconds] = parts.length === 3 ? parts : [0, ...parts];
  return hours * 3600 + minutes * 60 + seconds;
}

export function parseSubtitleImport(content: string, format: SubtitleExportFormat): SubtitleSegment[] {
  const text = content.replace(/^\uFEFF/, "").trim();
  if (format === "json") {
    const value: unknown = JSON.parse(text);
    if (!Array.isArray(value)) throw new Error("JSON must contain an array of subtitle segments.");
    return value.map((item, index) => {
      if (!item || typeof item !== "object") throw new Error(`Invalid JSON segment ${index + 1}.`);
      const segment = item as Record<string, unknown>;
      if (typeof segment.start !== "number" || typeof segment.end !== "number" || typeof segment.text !== "string") throw new Error(`Invalid JSON segment ${index + 1}.`);
      return { id: typeof segment.id === "number" ? segment.id : index + 1, start: segment.start, end: segment.end, text: segment.text };
    });
  }
  if (format === "txt") {
    return text.split(/\r?\n/).filter(Boolean).map((line, index) => ({ id: index + 1, start: index * 2, end: index * 2 + 1.95, text: line }));
  }
  if (format === "ass") {
    return text.split(/\r?\n/).filter((line) => line.startsWith("Dialogue:")).map((line, index) => {
      const values = line.slice(9).split(",");
      if (values.length < 10) throw new Error(`Invalid ASS dialogue ${index + 1}.`);
      return { id: index + 1, start: parseTimestamp(values[1]), end: parseTimestamp(values[2]), text: values.slice(9).join(",").replace(/\\N/g, "\n") };
    });
  }
  const blocks = text.replace(/^WEBVTT\s*/i, "").split(/\r?\n\s*\r?\n/);
  return blocks.map((block, index) => {
    const lines = block.split(/\r?\n/);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) throw new Error(`Invalid subtitle block ${index + 1}.`);
    const [start, end] = lines[timingIndex].split("-->").map((value) => parseTimestamp(value));
    return { id: Number(lines[timingIndex - 1]) || index + 1, start, end, text: lines.slice(timingIndex + 1).join("\n") };
  });
}

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

  if (format === "vtt") return buildVtt(segments);
  if (format === "ass") return buildAss(segments);

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
