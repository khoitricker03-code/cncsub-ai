import TimelineItem from "./TimelineItem";
import { useTimeline } from "@/app/hooks/useTimeline";
import type { SubtitleSegment } from "@/lib/subtitles";

type TimelineProps = {
  segments: SubtitleSegment[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
};

export default function Timeline({
  segments,
  currentTime,
  duration,
  onSeek,
}: TimelineProps) {
  const {
    activeSegmentId,
    timelineDuration,
    progressPercent,
    handleTimelineClick,
  } = useTimeline(segments, currentTime, duration, onSeek);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-3">
      <div
        className="relative h-20 min-w-[720px] cursor-pointer overflow-hidden rounded-lg bg-gray-900"
        onClick={handleTimelineClick}
        role="slider"
        aria-label="Video timeline"
        aria-valuemin={0}
        aria-valuemax={timelineDuration}
        aria-valuenow={currentTime}
        tabIndex={0}
      >
        {segments.map((segment) => (
          <TimelineItem
            key={segment.id}
            segment={segment}
            duration={timelineDuration}
            isActive={segment.id === activeSegmentId}
            onSeek={onSeek}
          />
        ))}

        <div
          className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-red-400"
          style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
