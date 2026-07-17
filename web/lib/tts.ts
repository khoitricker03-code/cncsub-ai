import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";

import { analyzeAudioVolume, probeAudio } from "./ffmpeg.ts";
import {
  formatEdgePitch,
  formatEdgeRate,
  type TTSOptions,
} from "./tts-config.ts";

export type { TTSOptions } from "./tts-config.ts";

export type PythonCommand = {
  command: string;
  prefixArgs: string[];
  displayName: string;
};

export type PythonProbeResult = "ready" | "module-missing" | "unavailable";
export type PythonProbe = (candidate: PythonCommand) => Promise<PythonProbeResult>;

type ProcessOutcome = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
};

const DEFAULT_PYTHON_CANDIDATES: PythonCommand[] = [
  ...(process.env.PYTHON_BIN
    ? [{ command: process.env.PYTHON_BIN, prefixArgs: [], displayName: process.env.PYTHON_BIN }]
    : []),
  { command: "python", prefixArgs: [], displayName: "python" },
  { command: "python3", prefixArgs: [], displayName: "python3" },
  { command: "py", prefixArgs: ["-3"], displayName: "py -3" },
];

let cachedPython: PythonCommand | null = null;

function runProcess(command: string, args: string[], signal?: AbortSignal): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ code: null, stdout: "", stderr: "", error: Object.assign(new Error("Operation cancelled"), { code: "ABORT_ERR" }) });
      return;
    }
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (outcome: ProcessOutcome) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve(outcome);
    };
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => (stdout += String(chunk)));
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.once("error", (error: NodeJS.ErrnoException) => finish({ code: null, stdout, stderr, error }));
    child.once("close", (code) => finish({ code, stdout, stderr }));
  });
}

async function probePython(candidate: PythonCommand): Promise<PythonProbeResult> {
  const version = await runProcess(candidate.command, [...candidate.prefixArgs, "--version"]);
  if (version.error || version.code !== 0) return "unavailable";
  const edgeTts = await runProcess(candidate.command, [
    ...candidate.prefixArgs,
    "-m",
    "edge_tts",
    "--version",
  ]);
  return edgeTts.code === 0 ? "ready" : "module-missing";
}

export async function findEdgeTtsPython(
  probe: PythonProbe = probePython,
  candidates: PythonCommand[] = DEFAULT_PYTHON_CANDIDATES,
): Promise<PythonCommand> {
  if (probe === probePython && cachedPython) return cachedPython;
  let pythonFound = false;
  for (const candidate of candidates) {
    const result = await probe(candidate);
    if (result === "ready") {
      if (probe === probePython) cachedPython = candidate;
      return candidate;
    }
    if (result === "module-missing") pythonFound = true;
  }
  if (pythonFound) {
    throw new Error("Edge TTS is not installed for the detected Python interpreter. Run: pip install edge-tts");
  }
  throw new Error("Python was not found. Install Python 3, then run: pip install edge-tts");
}

export async function getEdgeTtsHealth() {
  try {
    const python = await findEdgeTtsPython();
    return {
      ok: true,
      message: `Edge TTS is available through ${python.displayName}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export type SynthesizedAudio = {
  path: string;
  duration: number;
  voice: string;
};

export async function synthesizeSegment(
  text: string,
  outPath: string,
  options: TTSOptions,
  signal?: AbortSignal,
): Promise<SynthesizedAudio> {
  const value = text.trim();
  if (!value) throw new Error("Edge TTS cannot synthesize empty subtitle text.");
  if (options.provider !== "edge") throw new Error(`Unsupported TTS provider: ${options.provider}.`);
  if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");

  const python = await findEdgeTtsPython();
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  const textFile = `${outPath}.txt`;
  await fs.writeFile(textFile, value, "utf8");
  await fs.rm(outPath, { force: true });

  try {
    const outcome = await runProcess(python.command, [
      ...python.prefixArgs,
      "-m",
      "edge_tts",
      "--file",
      textFile,
      "--voice",
      options.voice,
      `--rate=${formatEdgeRate(options.rate)}`,
      `--pitch=${formatEdgePitch(options.pitch)}`,
      "--write-media",
      outPath,
    ], signal);

    if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
    if (outcome.error) {
      throw new Error(`Unable to start ${python.displayName}: ${outcome.error.message}`);
    }
    if (outcome.code !== 0) {
      const details = outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.code}`;
      if (/No module named ['"]?edge_tts/i.test(details)) {
        throw new Error("Edge TTS is not installed. Run: pip install edge-tts");
      }
      throw new Error(`Edge TTS failed: ${details}`);
    }

    const file = await fs.stat(outPath).catch(() => null);
    if (!file || file.size < 256) throw new Error("Edge TTS produced an empty audio file.");
    const audio = await probeAudio(outPath);
    if (!audio.duration || audio.duration <= 0) throw new Error("Edge TTS output has no playable audio duration.");
    const volume = await analyzeAudioVolume(outPath);
    if (!Number.isFinite(volume.maxVolumeDb) || volume.maxVolumeDb <= -80) {
      throw new Error("Edge TTS produced silent audio.");
    }
    return { path: outPath, duration: audio.duration, voice: options.voice };
  } finally {
    await fs.rm(textFile, { force: true }).catch(() => undefined);
  }
}
