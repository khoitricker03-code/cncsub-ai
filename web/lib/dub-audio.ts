export type TimedAudioClip = {
  id: number;
  start: number;
  end: number;
  duration: number;
};

function number(value: number) {
  return Number(value.toFixed(4)).toString();
}

export function buildAtempoChain(factor: number): string[] {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error("Tempo factor must be positive.");
  const filters: string[] = [];
  let remaining = factor;
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining /= 0.5;
  }
  if (Math.abs(remaining - 1) > 0.005 || filters.length === 0) {
    filters.push(`atempo=${number(remaining)}`);
  }
  return filters;
}

export function buildVoiceTimelineFilter(clips: TimedAudioClip[], videoDuration: number) {
  if (!clips.length) throw new Error("At least one TTS clip is required.");
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) throw new Error("Video duration must be positive.");

  const duration = number(videoDuration);
  const chains = clips.map((clip, index) => {
    const slotDuration = Math.max(0.1, clip.end - clip.start);
    const tempo = clip.duration > slotDuration * 1.02 ? clip.duration / slotDuration : 1;
    const delayMs = Math.max(0, Math.round(clip.start * 1000));
    return `[${index}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,${buildAtempoChain(tempo).join(",")},adelay=${delayMs}:all=1[voice${index}]`;
  });
  // Anchor the mix at t=0 so FFmpeg cannot normalize away the gap before the
  // first subtitle. This is a timeline bed only; every TTS clip is separately
  // checked for a real, non-silent audio stream before it reaches this filter.
  chains.unshift(`aevalsrc=0:d=${duration}:s=48000:c=stereo[timeline]`);
  const inputs = clips.map((_, index) => `[voice${index}]`).join("");
  chains.push(`[timeline]${inputs}amix=inputs=${clips.length + 1}:duration=longest:dropout_transition=0:normalize=0,atrim=end=${duration}[voice]`);
  return chains.join(";");
}

function validateMixVolume(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0 || value > 2) {
    throw new Error(`${name} must be between 0 and 2.`);
  }
}

export function buildSeparatedAudioMixFilter(
  backgroundVolume: number,
  voiceVolume: number,
  videoDuration: number,
) {
  validateMixVolume(backgroundVolume, "backgroundVolume");
  validateMixVolume(voiceVolume, "voiceVolume");
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
    throw new Error("Video duration must be positive.");
  }
  const duration = number(videoDuration);
  return `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${number(backgroundVolume)}[background];[1:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${number(voiceVolume)}[ai];[background][ai]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,alimiter=limit=0.95,apad=pad_dur=${duration},atrim=end=${duration}[mixed]`;
}

export function buildVoiceOnlyMixFilter(voiceVolume: number, videoDuration: number) {
  validateMixVolume(voiceVolume, "voiceVolume");
  if (!Number.isFinite(videoDuration) || videoDuration <= 0) {
    throw new Error("Video duration must be positive.");
  }
  const duration = number(videoDuration);
  return `[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${number(voiceVolume)},alimiter=limit=0.95,apad=pad_dur=${duration},atrim=end=${duration}[mixed]`;
}
