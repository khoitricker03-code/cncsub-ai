import {
  formatSrtTime,
  isValidSegmentTiming,
  type SubtitleSegment,
} from "@/lib/subtitles";

type SubtitleSegmentRowProps = {
  index: number;
  segment: SubtitleSegment;
  onChange: (segment: SubtitleSegment) => void;
  onSeek: (time: number) => void;
  isActive: boolean;
};

function parseTime(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export default function SubtitleSegmentRow({
  index,
  segment,
  onChange,
  onSeek,
  isActive,
}: SubtitleSegmentRowProps) {
  const isValid = isValidSegmentTiming(segment);

  return (
    <article
      className={[
        "rounded-xl border p-4 transition-colors",
        !isValid
          ? "border-red-500 bg-red-950/30"
          : isActive
            ? "border-blue-400 bg-blue-950/40"
            : "border-gray-800 bg-gray-900",
      ].join(" ")}
      data-segment-id={segment.id}
      onClick={() => onSeek(segment.start)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-semibold text-gray-300">
          Câu {index + 1}
        </span>
        <span className="font-mono text-xs text-gray-400">
          {formatSrtTime(segment.start)} → {formatSrtTime(segment.end)}
        </span>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-gray-400">
          Bắt đầu (giây)
          <input
            type="number"
            min="0"
            step="0.001"
            value={segment.start}
            onChange={(event) =>
              onChange({ ...segment, start: parseTime(event.target.value) })
            }
            onClick={(event) => event.stopPropagation()}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white outline-none focus:border-blue-500"
          />
        </label>

        <label className="text-xs text-gray-400">
          Kết thúc (giây)
          <input
            type="number"
            min="0"
            step="0.001"
            value={segment.end}
            onChange={(event) =>
              onChange({ ...segment, end: parseTime(event.target.value) })
            }
            onClick={(event) => event.stopPropagation()}
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-2 text-white outline-none focus:border-blue-500"
          />
        </label>
      </div>

      <textarea
        value={segment.text}
        onChange={(event) =>
          onChange({ ...segment, text: event.target.value })
        }
        onClick={(event) => event.stopPropagation()}
        rows={3}
        className="w-full resize-y rounded-lg border border-gray-700 bg-gray-950 p-3 leading-6 text-white outline-none focus:border-blue-500"
        aria-label={`Nội dung câu phụ đề ${index + 1}`}
      />

      {!isValid && (
        <p className="mt-2 text-sm text-red-300">
          Thời gian kết thúc phải lớn hơn thời gian bắt đầu.
        </p>
      )}
    </article>
  );
}
