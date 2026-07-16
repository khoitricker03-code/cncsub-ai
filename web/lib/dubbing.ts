import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { probeVideo } from "./ffmpeg.ts";
import { validateSegments, type SubtitleSegment } from "./subtitles.ts";

type ProcessOptions = {
  signal?: AbortSignal;
  stdin?: string;
};

export type DubbingOptions = {
  inputVideo: string;
  outputVideo: string;
  segments: SubtitleSegment[];
  language: string;
  backgroundVolume?: number;
  signal?: AbortSignal;
};

export type DubbingResult = {
  outputVideo: string;
  duration: number;
  segmentCount: number;
  ttsProvider: "piper" | "windows" | "flite";
};

function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const abort = () => child.kill("SIGTERM");
    options.signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      options.signal?.removeEventListener("abort", abort);
      if (options.signal?.aborted) {
        reject(new DOMException("Operation cancelled", "AbortError"));
      } else if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `${command} exited with code ${code}`));
      }
    });
    if (options.stdin !== undefined) child.stdin.end(options.stdin);
  });
}

async function canRun(command: string, args: string[]): Promise<boolean> {
  try {
    await runProcess(command, args);
    return true;
  } catch {
    return false;
  }
}

function escapeFilterPath(value: string): string {
  return path
    .resolve(value)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

async function synthesizeWithPiper(
  text: string,
  output: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const model = process.env.PIPER_MODEL;
  const executable = process.env.PIPER_EXECUTABLE || "piper";
  if (!model || !(await canRun(executable, ["--help"]))) return false;
  await runProcess(
    executable,
    ["--model", model, "--output_file", output],
    { signal, stdin: text },
  );
  return true;
}

async function synthesizeWithWindowsSpeech(
  textFile: string,
  output: string,
  language: string,
  signal?: AbortSignal,
): Promise<boolean> {
  if (process.platform !== "win32") return false;
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$text = Get-Content -Raw -Encoding UTF8 $args[0]",
    "$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$culture = $args[2]",
    "$voice = $speaker.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like \"$culture*\" } | Select-Object -First 1",
    "if ($voice) { $speaker.SelectVoice($voice.VoiceInfo.Name) }",
    "$speaker.SetOutputToWaveFile($args[1])",
    "$speaker.Speak($text)",
    "$speaker.Dispose()",
  ].join("; ");
  await runProcess(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script, textFile, output, language],
    { signal },
  );
  return true;
}

async function synthesizeWithFlite(
  textFile: string,
  output: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const filters = await runProcess("ffmpeg", ["-hide_banner", "-filters"]);
  if (!filters.stdout.includes(" flite ") && !filters.stderr.includes(" flite ")) {
    return false;
  }
  await runProcess(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `flite=textfile='${escapeFilterPath(textFile)}':voice=slt`,
      "-ar",
      "24000",
      "-ac",
      "1",
      output,
    ],
    { signal },
  );
  return true;
}

async function synthesizeSpeech(
  text: string,
  output: string,
  language: string,
  signal?: AbortSignal,
): Promise<DubbingResult["ttsProvider"]> {
  const textFile = `${output}.txt`;
  await fs.writeFile(textFile, text, "utf8");
  if (await synthesizeWithPiper(text, output, signal)) return "piper";
  if (await synthesizeWithWindowsSpeech(textFile, output, language, signal)) {
    return "windows";
  }
  if (await synthesizeWithFlite(textFile, output, signal)) return "flite";
  throw new Error(
    "Không tìm thấy TTS cục bộ. Cài Piper và đặt PIPER_MODEL, hoặc cài FFmpeg có bộ lọc flite.",
  );
}

async function probeDuration(file: string): Promise<number> {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  const duration = Number(stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("TTS không tạo được audio hợp lệ.");
  }
  return duration;
}

export function buildTempoFilters(ratio: number): string[] {
  const filters: string[] = [];
  let remaining = Math.max(1, ratio);
  while (remaining > 2) {
    filters.push("atempo=2");
    remaining /= 2;
  }
  if (remaining > 1.001) filters.push(`atempo=${remaining.toFixed(6)}`);
  return filters;
}

export async function renderDubbedVideo(
  options: DubbingOptions,
): Promise<DubbingResult> {
  const validationError = validateSegments(options.segments);
  if (validationError) throw new Error(validationError);
  if (options.segments.length === 0) throw new Error("Chưa có phụ đề đã dịch để lồng tiếng.");

  const metadata = await probeVideo(options.inputVideo);
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "cncsub-dub-"));
  await fs.mkdir(path.dirname(options.outputVideo), { recursive: true });
  const parsedOutput = path.parse(options.outputVideo);
  const temporaryOutput = path.join(
    parsedOutput.dir,
    `${parsedOutput.name}.tmp-${process.pid}-${Date.now()}${parsedOutput.ext}`,
  );
  let provider: DubbingResult["ttsProvider"] | null = null;

  try {
    const clips: Array<{ file: string; duration: number }> = [];
    for (const [index, segment] of options.segments.entries()) {
      const file = path.join(workDir, `speech-${index}.wav`);
      const currentProvider = await synthesizeSpeech(
        segment.text,
        file,
        options.language,
        options.signal,
      );
      provider ??= currentProvider;
      clips.push({ file, duration: await probeDuration(file) });
    }

    const filterParts: string[] = [];
    const voiceLabels: string[] = [];
    options.segments.forEach((segment, index) => {
      const window = Math.max(0.05, segment.end - segment.start);
      const tempo = buildTempoFilters(clips[index].duration / window);
      const filters = [
        "aresample=48000",
        ...tempo,
        `atrim=duration=${window.toFixed(3)}`,
        "asetpts=PTS-STARTPTS",
        `adelay=${Math.round(segment.start * 1000)}:all=1`,
      ];
      const label = `voice${index}`;
      filterParts.push(`[${index + 1}:a]${filters.join(",")}[${label}]`);
      voiceLabels.push(`[${label}]`);
    });
    filterParts.push(
      `${voiceLabels.join("")}amix=inputs=${voiceLabels.length}:normalize=0:dropout_transition=0[narration]`,
    );

    if (metadata.audioCodec) {
      const volume = Math.max(0, Math.min(1, options.backgroundVolume ?? 0.2));
      filterParts.push(`[0:a]volume=${volume.toFixed(2)}[background]`);
      filterParts.push(
        `[background][narration]amix=inputs=2:normalize=0:duration=first:dropout_transition=0[mixed]`,
      );
    } else {
      filterParts.push(
        `[narration]apad,atrim=duration=${metadata.duration.toFixed(3)}[mixed]`,
      );
    }

    const args = ["-y", "-i", options.inputVideo];
    clips.forEach((clip) => args.push("-i", clip.file));
    args.push(
      "-filter_complex",
      filterParts.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[mixed]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-t",
      metadata.duration.toFixed(3),
      "-movflags",
      "+faststart",
      temporaryOutput,
    );
    await runProcess("ffmpeg", args, { signal: options.signal });
    await fs.rename(temporaryOutput, options.outputVideo);
    return {
      outputVideo: options.outputVideo,
      duration: metadata.duration,
      segmentCount: options.segments.length,
      ttsProvider: provider ?? "flite",
    };
  } finally {
    await fs.rm(temporaryOutput, { force: true });
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
