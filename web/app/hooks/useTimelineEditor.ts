"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SubtitleSegment } from "@/lib/subtitles";

export type TimelineEditMode = "move" | "resize-start" | "resize-end";

type Interaction = {
  segmentId: number;
  mode: TimelineEditMode;
  originX: number;
  original: SubtitleSegment;
};

type UseTimelineEditorOptions = {
  segments: SubtitleSegment[];
  duration: number;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onSeek: (time: number) => void;
  onCommit: (segment: SubtitleSegment) => void;
};

const GRID_SECONDS = 0.05;
const MIN_DURATION = 0.05;
const EDGE_SIZE = 56;

function snap(value: number): number {
  return Math.round(value / GRID_SECONDS) * GRID_SECONDS;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function roundTime(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function useTimelineEditor({
  segments,
  duration,
  timelineRef,
  scrollRef,
  onSeek,
  onCommit,
}: UseTimelineEditorOptions) {
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [ghostSegment, setGhostSegment] = useState<SubtitleSegment | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const ghostRef = useRef<SubtitleSegment | null>(null);
  const lastPointerX = useRef<number | null>(null);

  const beginEdit = useCallback(
    (event: React.PointerEvent, segment: SubtitleSegment, mode: TimelineEditMode) => {
      event.preventDefault();
      event.stopPropagation();

      const next = {
        segmentId: segment.id,
        mode,
        originX: event.clientX,
        original: segment,
      };

      interactionRef.current = next;
      ghostRef.current = segment;
      lastPointerX.current = event.clientX;
      setInteraction(next);
      setGhostSegment(segment);
    },
    [],
  );

  useEffect(() => {
    if (!interaction) {
      return;
    }

    const getEditedSegment = (clientX: number) => {
      const active = interactionRef.current;
      const timeline = timelineRef.current;

      if (!active || !timeline) {
        return null;
      }

      const index = segments.findIndex(
        (segment) => segment.id === active.segmentId,
      );
      const previous = index > 0 ? segments[index - 1] : null;
      const next = index < segments.length - 1 ? segments[index + 1] : null;
      const delta = snap(
        ((clientX - active.originX) / timeline.getBoundingClientRect().width) *
          duration,
      );
      const original = active.original;

      if (active.mode === "move") {
        const length = original.end - original.start;
        const start = clamp(
          snap(original.start + delta),
          previous?.end ?? 0,
          (next?.start ?? duration) - length,
        );
        return {
          ...original,
          start: roundTime(start),
          end: roundTime(start + length),
        };
      }

      if (active.mode === "resize-start") {
        return {
          ...original,
          start: roundTime(
            clamp(
              snap(original.start + delta),
              previous?.end ?? 0,
              original.end - MIN_DURATION,
            ),
          ),
        };
      }

      return {
        ...original,
        end: roundTime(
          clamp(
            snap(original.end + delta),
            original.start + MIN_DURATION,
            next?.start ?? duration,
          ),
        ),
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      lastPointerX.current = event.clientX;
      const edited = getEditedSegment(event.clientX);

      if (!edited) {
        return;
      }

      ghostRef.current = edited;
      setGhostSegment(edited);
      onSeek(interaction.mode === "resize-end" ? edited.end : edited.start);
    };

    const finishEdit = () => {
      const edited = ghostRef.current;
      const original = interactionRef.current?.original;

      if (
        edited &&
        original &&
        (edited.start !== original.start || edited.end !== original.end)
      ) {
        onCommit(edited);
      }

      interactionRef.current = null;
      ghostRef.current = null;
      lastPointerX.current = null;
      setInteraction(null);
      setGhostSegment(null);
    };

    let animationFrame = 0;
    const autoScroll = () => {
      const scroll = scrollRef.current;
      const clientX = lastPointerX.current;

      if (scroll && clientX !== null) {
        const bounds = scroll.getBoundingClientRect();
        let didScroll = false;

        if (clientX < bounds.left + EDGE_SIZE) {
          scroll.scrollLeft -= 10;
          didScroll = true;
        } else if (clientX > bounds.right - EDGE_SIZE) {
          scroll.scrollLeft += 10;
          didScroll = true;
        }

        if (didScroll) {
          const edited = getEditedSegment(clientX);

          if (edited) {
            ghostRef.current = edited;
            setGhostSegment(edited);
            onSeek(interaction.mode === "resize-end" ? edited.end : edited.start);
          }
        }
      }

      animationFrame = requestAnimationFrame(autoScroll);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishEdit, { once: true });
    window.addEventListener("pointercancel", finishEdit, { once: true });
    animationFrame = requestAnimationFrame(autoScroll);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishEdit);
      window.removeEventListener("pointercancel", finishEdit);
      cancelAnimationFrame(animationFrame);
    };
  }, [duration, interaction, onCommit, onSeek, scrollRef, segments, timelineRef]);

  return {
    beginEdit,
    ghostSegment,
    editingSegmentId: interaction?.segmentId ?? null,
  };
}
