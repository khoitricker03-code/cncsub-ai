import TimelineDragHandle from "./TimelineDragHandle";
import TimelineResizeHandle from "./TimelineResizeHandle";
import type { TimelineEditMode } from "@/app/hooks/useTimelineEditor";
import type { SubtitleSegment } from "@/lib/subtitles";

type TimelineItemProps = {
  segment: SubtitleSegment;
  duration: number;
  isActive: boolean;
  isEditing: boolean;
  onSeek: (time: number) => void;
  onBeginEdit: (
    event: React.PointerEvent,
    segment: SubtitleSegment,
    mode: TimelineEditMode,
  ) => void;
};

export default function TimelineItem({
  segment,
  duration,
  isActive,
  isEditing,
  onSeek,
  onBeginEdit,
}: TimelineItemProps) {
  const left = (segment.start / duration) * 100;
  const width = Math.max(((segment.end - segment.start) / duration) * 100, 0.4);

  return (
    <div
      title={segment.text}
      className={[
        "group absolute top-3 h-12 overflow-hidden rounded border px-2 text-left text-xs transition-colors",
        isEditing
          ? "opacity-30"
          : isActive
            ? "z-10 border-blue-300 bg-blue-500 text-white"
            : "border-gray-600 bg-gray-700 text-gray-200 hover:bg-gray-600",
      ].join(" ")}
      style={{ left: `${left}%`, width: `${width}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onSeek(segment.start);
      }}
    >
      <span className="pointer-events-none relative z-10 block truncate">
        {segment.text || "(Trống)"}
      </span>
      <TimelineDragHandle
        onPointerDown={(event) => onBeginEdit(event, segment, "move")}
      />
      <TimelineResizeHandle
        edge="left"
        onPointerDown={(event) => onBeginEdit(event, segment, "resize-start")}
      />
      <TimelineResizeHandle
        edge="right"
        onPointerDown={(event) => onBeginEdit(event, segment, "resize-end")}
      />
    </div>
  );
}
