"use client";

import { useCallback, useMemo } from "react";

import type { SubtitleSegment } from "@/lib/subtitles";

export function useTimeline(
  segments: SubtitleSegment[],
  currentTime: number,
  duration: number,
  onSeek: (time: number) => void,
) {
  const activeSegmentId = useMemo(
    () =>
      segments.find(
        (segment) =>
          currentTime >= segment.start && currentTime < segment.end,
      )?.id ?? null,
    [currentTime, segments],
  );

  const timelineDuration = Math.max(
    duration,
    segments.at(-1)?.end ?? 0,
    0.001,
  );

  const handleTimelineClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - bounds.left) / bounds.width;
      onSeek(Math.min(1, Math.max(0, ratio)) * timelineDuration);
    },
    [onSeek, timelineDuration],
  );

  return {
    activeSegmentId,
    timelineDuration,
    progressPercent: Math.min(
      100,
      Math.max(0, (currentTime / timelineDuration) * 100),
    ),
    handleTimelineClick,
  };
}
