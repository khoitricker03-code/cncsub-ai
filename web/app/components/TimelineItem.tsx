import type { SubtitleSegment } from "@/lib/subtitles";

type TimelineItemProps = {
  segment: SubtitleSegment;
  duration: number;
  isActive: boolean;
  onSeek: (time: number) => void;
};

export default function TimelineItem({
  segment,
  duration,
  isActive,
  onSeek,
}: TimelineItemProps) {
  const left = (segment.start / duration) * 100;
  const width = Math.max(((segment.end - segment.start) / duration) * 100, 0.4);

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onSeek(segment.start);
      }}
      title={segment.text}
      className={[
        "absolute top-3 h-12 overflow-hidden rounded border px-2 text-left text-xs transition-colors",
        isActive
          ? "z-10 border-blue-300 bg-blue-500 text-white"
          : "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600",
      ].join(" ")}
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <span className="block truncate">{segment.text || "(Trống)"}</span>
    </button>
  );
}
