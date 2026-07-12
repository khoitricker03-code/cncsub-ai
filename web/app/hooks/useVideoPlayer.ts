"use client";

import { useCallback, useRef, useState } from "react";

export const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;

export function useVideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const play = useCallback(async () => {
    await videoRef.current?.play();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const togglePlayback = useCallback(async () => {
    if (videoRef.current?.paused) {
      await play();
    } else {
      pause();
    }
  }, [pause, play]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;

    if (!video) {
      return;
    }

    const maximum = Number.isFinite(video.duration) ? video.duration : time;
    video.currentTime = Math.min(Math.max(0, time), maximum);
    setCurrentTime(video.currentTime);
  }, []);

  const skip = useCallback(
    (seconds: number) => seek((videoRef.current?.currentTime ?? 0) + seconds),
    [seek],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }

    setPlaybackRateState(rate);
  }, []);

  return {
    videoRef,
    currentTime,
    duration,
    isPlaying,
    playbackRate,
    play,
    pause,
    togglePlayback,
    seek,
    skip,
    setPlaybackRate,
    videoEvents: {
      onTimeUpdate: () => setCurrentTime(videoRef.current?.currentTime ?? 0),
      onDurationChange: () => setDuration(videoRef.current?.duration ?? 0),
      onPlay: () => setIsPlaying(true),
      onPause: () => setIsPlaying(false),
      onEnded: () => setIsPlaying(false),
    },
  };
}
