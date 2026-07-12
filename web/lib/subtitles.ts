export type SubtitleSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export function isSubtitleSegment(value: unknown): value is SubtitleSegment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const segment = value as Record<string, unknown>;

  return (
    typeof segment.id === "number" &&
    Number.isFinite(segment.id) &&
    typeof segment.start === "number" &&
    Number.isFinite(segment.start) &&
    segment.start >= 0 &&
    typeof segment.end === "number" &&
    Number.isFinite(segment.end) &&
    typeof segment.text === "string"
  );
}

export function isValidSegmentTiming(segment: SubtitleSegment): boolean {
  return segment.start >= 0 && segment.end > segment.start;
}

export function validateSegments(segments: SubtitleSegment[]): string | null {
  if (segments.length === 0) {
    return "Project phải có ít nhất một câu phụ đề.";
  }

  const invalidIndex = segments.findIndex(
    (segment) => !isValidSegmentTiming(segment),
  );

  return invalidIndex === -1
    ? null
    : `Thời gian kết thúc phải lớn hơn thời gian bắt đầu ở câu ${invalidIndex + 1}.`;
}

export function formatSrtTime(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const secs = Math.floor((total % 60_000) / 1000);
  const milliseconds = total % 1000;

  return (
    `${String(hours).padStart(2, "0")}:` +
    `${String(minutes).padStart(2, "0")}:` +
    `${String(secs).padStart(2, "0")},` +
    String(milliseconds).padStart(3, "0")
  );
}

export function buildSrt(segments: SubtitleSegment[]): string {
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

export function buildTranscript(segments: SubtitleSegment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join("\n");
}
