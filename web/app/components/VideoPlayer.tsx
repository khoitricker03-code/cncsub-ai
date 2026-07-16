"use client";

import { useEffect } from "react";

import Timeline from "./Timeline";
import {
  PLAYBACK_SPEEDS,
  useVideoPlayer,
} from "@/app/hooks/useVideoPlayer";
import { formatSrtTime, type SubtitleSegment } from "@/lib/subtitles";

type VideoPlayerProps = {
  projectId: string;
  segments: SubtitleSegment[];
  onTimeChange: (time: number) => void;
  onPlayerReady: (seek: (time: number) => void) => void;
  onSegmentChange: (segment: SubtitleSegment) => void;
  useRendered?: boolean;
};

function formatPlaybackTime(seconds: number): string {
  return formatSrtTime(seconds).replace(",", ".");
}

export default function VideoPlayer({
  projectId,
  segments,
  onTimeChange,
  onPlayerReady,
  onSegmentChange,
  useRendered = false,
}: VideoPlayerProps) {
  const {
    videoRef,
    currentTime,
    duration,
    isPlaying,
    playbackRate,
    togglePlayback,
    seek,
    skip,
    setPlaybackRate,
    videoEvents,
  } = useVideoPlayer();

  useEffect(() => {
    onPlayerReady(seek);
  }, [onPlayerReady, seek]);

  const handleTimeUpdate = () => {
    videoEvents.onTimeUpdate();
    onTimeChange(videoRef.current?.currentTime ?? 0);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <video
        ref={videoRef}
        src={`/api/projects/${projectId}/video${useRendered ? "?rendered=true" : ""}`}
        className="aspect-video w-full rounded-xl bg-black"
        preload="metadata"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={videoEvents.onDurationChange}
        onPlay={videoEvents.onPlay}
        onPause={videoEvents.onPause}
        onEnded={videoEvents.onEnded}
      />

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => skip(-5)} className="rounded-lg bg-gray-700 px-3 py-2 hover:bg-gray-600">−5 giây</button>
        <button type="button" onClick={() => void togglePlayback()} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold hover:bg-blue-700">
          {isPlaying ? "Tạm dừng" : "Phát"}
        </button>
        <button type="button" onClick={() => skip(5)} className="rounded-lg bg-gray-700 px-3 py-2 hover:bg-gray-600">+5 giây</button>

        <span className="ml-1 font-mono text-sm text-gray-300">
          {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
        </span>

        <label className="ml-auto text-sm text-gray-400">
          Tốc độ
          <select
            value={playbackRate}
            onChange={(event) => setPlaybackRate(Number(event.target.value))}
            className="ml-2 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white"
          >
            {PLAYBACK_SPEEDS.map((speed) => (
              <option key={speed} value={speed}>{speed}x</option>
            ))}
          </select>
        </label>
      </div>

      <Timeline
        segments={segments}
        currentTime={currentTime}
        duration={duration}
        onSeek={seek}
        onSegmentChange={onSegmentChange}
      />
    </section>
  );
}
