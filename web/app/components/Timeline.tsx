"use client";

import { useRef } from "react";

import TimelineItem from "./TimelineItem";
import { useTimeline } from "@/app/hooks/useTimeline";
import { useTimelineEditor } from "@/app/hooks/useTimelineEditor";
import type { SubtitleSegment } from "@/lib/subtitles";

type TimelineProps = {
  segments: SubtitleSegment[];
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  onSegmentChange: (segment: SubtitleSegment) => void;
};

export default function Timeline({
  segments,
  currentTime,
  duration,
  onSeek,
  onSegmentChange,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const {
    activeSegmentId,
    timelineDuration,
    progressPercent,
    handleTimelineClick,
  } = useTimeline(segments, currentTime, duration, onSeek);
  const { beginEdit, ghostSegment, editingSegmentId } = useTimelineEditor({
    segments,
    duration: timelineDuration,
    timelineRef,
    scrollRef,
    onSeek,
    onCommit: onSegmentChange,
  });
  const timelineWidth = Math.max(720, timelineDuration * 80);

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950 p-3"
    >
      <div
        ref={timelineRef}
        className="relative h-20 cursor-pointer overflow-hidden rounded-lg bg-gray-900"
        style={{ width: `${timelineWidth}px` }}
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
            isEditing={segment.id === editingSegmentId}
            onSeek={onSeek}
            onBeginEdit={beginEdit}
          />
        ))}

        {ghostSegment && (
          <div
            className="pointer-events-none absolute top-3 z-30 h-12 rounded border-2 border-dashed border-cyan-300 bg-cyan-500/40"
            style={{
              left: `${(ghostSegment.start / timelineDuration) * 100}%`,
              width: `${Math.max(((ghostSegment.end - ghostSegment.start) / timelineDuration) * 100, 0.4)}%`,
            }}
          />
        )}

        <div
          className="pointer-events-none absolute inset-y-0 z-40 w-0.5 bg-red-400"
          style={{ left: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}
