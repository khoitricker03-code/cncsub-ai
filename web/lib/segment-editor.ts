import type { SubtitleSegment } from "./subtitles";

const MIN_DURATION = 0.05;
const DEFAULT_DURATION = 2;

export type SegmentEditResult = {
  segments: SubtitleSegment[];
  selectedId: number | null;
  error?: string;
};

export function createSegmentId(segments: SubtitleSegment[]): number {
  return segments.reduce((maximum, segment) => Math.max(maximum, segment.id), 0) + 1;
}

function splitText(text: string): [string, string] {
  const newline = text.indexOf("\n");
  if (newline > 0 && newline < text.length - 1) {
    return [text.slice(0, newline).trim(), text.slice(newline + 1).trim()];
  }

  const words = text.trim().split(/\s+/);
  const middle = Math.max(1, Math.ceil(words.length / 2));
  return [words.slice(0, middle).join(" "), words.slice(middle).join(" ")];
}

export function splitSegment(
  segments: SubtitleSegment[],
  segmentId: number,
  playhead: number,
): SegmentEditResult {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const segment = segments[index];

  if (!segment) return { segments, selectedId: null, error: "Không tìm thấy câu phụ đề." };
  if (playhead <= segment.start + MIN_DURATION || playhead >= segment.end - MIN_DURATION) {
    return {
      segments,
      selectedId: segmentId,
      error: "Playhead phải nằm bên trong câu và cách mỗi cạnh ít nhất 50 ms.",
    };
  }

  const [leftText, rightText] = splitText(segment.text);
  const nextId = createSegmentId(segments);
  const left = { ...segment, end: playhead, text: leftText };
  const right = { ...segment, id: nextId, start: playhead, text: rightText };
  return {
    segments: [...segments.slice(0, index), left, right, ...segments.slice(index + 1)],
    selectedId: nextId,
  };
}

export function mergeWithNext(
  segments: SubtitleSegment[],
  segmentId: number,
): SegmentEditResult {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const current = segments[index];
  const next = segments[index + 1];

  if (!current || !next) {
    return { segments, selectedId: segmentId, error: "Không có câu kế tiếp để gộp." };
  }

  const merged = {
    ...current,
    end: next.end,
    text: [current.text.trim(), next.text.trim()].filter(Boolean).join("\n"),
  };
  return {
    segments: [...segments.slice(0, index), merged, ...segments.slice(index + 2)],
    selectedId: merged.id,
  };
}

export function deleteSegment(
  segments: SubtitleSegment[],
  segmentId: number,
): SegmentEditResult {
  if (segments.length <= 1) {
    return { segments, selectedId: segmentId, error: "Project phải có ít nhất một câu." };
  }

  const index = segments.findIndex((segment) => segment.id === segmentId);
  if (index < 0) return { segments, selectedId: null, error: "Không tìm thấy câu phụ đề." };
  const next = segments.filter((segment) => segment.id !== segmentId);
  return { segments: next, selectedId: next[Math.min(index, next.length - 1)]?.id ?? null };
}

export function duplicateSegment(
  segments: SubtitleSegment[],
  segmentId: number,
): SegmentEditResult {
  const index = segments.findIndex((segment) => segment.id === segmentId);
  const segment = segments[index];
  if (!segment) return { segments, selectedId: null, error: "Không tìm thấy câu phụ đề." };

  const nextStart = segments[index + 1]?.start ?? Number.POSITIVE_INFINITY;
  const available = nextStart - segment.end;
  if (available < MIN_DURATION) {
    return {
      segments,
      selectedId: segmentId,
      error: "Không đủ khoảng trống sau câu để nhân bản mà không chồng lấn.",
    };
  }

  const duration = Math.min(segment.end - segment.start, available);
  const duplicate = {
    ...segment,
    id: createSegmentId(segments),
    start: segment.end,
    end: segment.end + duration,
  };
  return {
    segments: [...segments.slice(0, index + 1), duplicate, ...segments.slice(index + 1)],
    selectedId: duplicate.id,
  };
}

export function addSegment(
  segments: SubtitleSegment[],
  playhead: number,
): SegmentEditResult {
  const nextId = createSegmentId(segments);
  let start = Math.max(0, playhead);
  let insertAt = segments.findIndex((segment) => segment.start >= start);
  const previous = segments[insertAt < 0 ? segments.length - 1 : insertAt - 1];

  if (previous && start < previous.end) start = previous.end;
  if (insertAt < 0) insertAt = segments.length;
  while (insertAt < segments.length && segments[insertAt].end <= start) insertAt += 1;

  const nextStart = segments[insertAt]?.start ?? Number.POSITIVE_INFINITY;
  if (nextStart - start < MIN_DURATION) {
    start = segments[insertAt]?.end ?? start;
    insertAt += 1;
  }

  const followingStart = segments[insertAt]?.start ?? Number.POSITIVE_INFINITY;
  const end = Math.min(start + DEFAULT_DURATION, followingStart);
  if (end - start < MIN_DURATION) {
    return { segments, selectedId: null, error: "Không tìm được khoảng trống để thêm câu." };
  }

  const segment = { id: nextId, start, end, text: "" };
  return {
    segments: [...segments.slice(0, insertAt), segment, ...segments.slice(insertAt)],
    selectedId: nextId,
  };
}
