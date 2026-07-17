import { spawn } from "child_process";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";

import { probeAudio, runFfmpeg } from "./ffmpeg.ts";

export type DemucsPythonCommand = {
  command: string;
  prefixArgs: string[];
  displayName: string;
};

export type DemucsProbeResult = "ready" | "module-missing" | "unavailable";
export type DemucsProbe = (candidate: DemucsPythonCommand) => Promise<DemucsProbeResult>;

type ProcessOutcome = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
};

export type SeparationManifest = {
  version: 1;
  sourceSha256: string;
  model: string;
  vocalsFile: "vocals.wav";
  accompanimentFile: "accompaniment.wav";
  createdAt: string;
};

export type SeparationResult = {
  vocalsPath: string;
  accompanimentPath: string;
  sourceSha256: string;
  model: string;
  cacheHit: boolean;
};

const DEFAULT_PYTHON_CANDIDATES: DemucsPythonCommand[] = [
  ...(process.env.PYTHON_BIN
    ? [{ command: process.env.PYTHON_BIN, prefixArgs: [], displayName: process.env.PYTHON_BIN }]
    : []),
  { command: "python", prefixArgs: [], displayName: "python" },
  { command: "python3", prefixArgs: [], displayName: "python3" },
  { command: "py", prefixArgs: ["-3"], displayName: "py -3" },
];

let cachedPython: DemucsPythonCommand | null = null;

function runProcess(command: string, args: string[], signal?: AbortSignal): Promise<ProcessOutcome> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({
        code: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("Operation cancelled"), { code: "ABORT_ERR" }),
      });
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

async function probePython(candidate: DemucsPythonCommand): Promise<DemucsProbeResult> {
  const version = await runProcess(candidate.command, [...candidate.prefixArgs, "--version"]);
  if (version.error || version.code !== 0) return "unavailable";
  const demucs = await runProcess(candidate.command, [
    ...candidate.prefixArgs,
    "-m",
    "demucs",
    "--help",
  ]);
  return demucs.code === 0 ? "ready" : "module-missing";
}

export async function findDemucsPython(
  probe: DemucsProbe = probePython,
  candidates: DemucsPythonCommand[] = DEFAULT_PYTHON_CANDIDATES,
): Promise<DemucsPythonCommand> {
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
    throw new Error("Demucs is not installed for the detected Python interpreter. Run: python -m pip install demucs");
  }
  throw new Error("Python was not found. Install Python 3, then run: python -m pip install demucs");
}

export async function getDemucsHealth() {
  try {
    const python = await findDemucsPython();
    return {
      ok: true,
      message: `Demucs is available through ${python.displayName}.`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getDemucsModel() {
  const model = (process.env.DEMUCS_MODEL || "htdemucs").trim();
  if (!/^[A-Za-z0-9_.-]+$/.test(model)) {
    throw new Error("DEMUCS_MODEL contains unsupported characters.");
  }
  return model;
}

export function buildDemucsArgs(sourceAudio: string, outputDir: string, model: string) {
  return [
    "-m",
    "demucs",
    "--two-stems",
    "vocals",
    "--name",
    model,
    "--out",
    outputDir,
    sourceAudio,
  ];
}

export function getDemucsOutputPaths(outputDir: string, model: string, sourceAudio: string) {
  const trackName = path.parse(sourceAudio).name;
  const trackDir = path.join(outputDir, model, trackName);
  return {
    vocalsPath: path.join(trackDir, "vocals.wav"),
    accompanimentPath: path.join(trackDir, "no_vocals.wav"),
  };
}

export function isSeparationManifest(
  value: unknown,
  sourceSha256: string,
  model: string,
): value is SeparationManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<SeparationManifest>;
  return manifest.version === 1
    && manifest.sourceSha256 === sourceSha256
    && manifest.model === model
    && manifest.vocalsFile === "vocals.wav"
    && manifest.accompanimentFile === "accompaniment.wav";
}

async function sha256File(file: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function validateStem(file: string, label: string) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat || stat.size < 256) throw new Error(`${label} is missing or empty.`);
  const audio = await probeAudio(file);
  if (!audio.duration || audio.duration <= 0) throw new Error(`${label} has no playable audio stream.`);
}

async function readCachedSeparation(
  cacheDir: string,
  sourceSha256: string,
  model: string,
): Promise<SeparationResult | null> {
  const manifestPath = path.join(cacheDir, "manifest.json");
  try {
    const manifest: unknown = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    if (!isSeparationManifest(manifest, sourceSha256, model)) return null;
    const vocalsPath = path.join(cacheDir, manifest.vocalsFile);
    const accompanimentPath = path.join(cacheDir, manifest.accompanimentFile);
    await Promise.all([
      validateStem(vocalsPath, "Cached Demucs vocals"),
      validateStem(accompanimentPath, "Cached Demucs accompaniment"),
    ]);
    return { vocalsPath, accompanimentPath, sourceSha256, model, cacheHit: true };
  } catch {
    return null;
  }
}

export async function ensureSeparatedAudio(options: {
  inputVideo: string;
  cacheDir: string;
  signal?: AbortSignal;
  onProgress?: (phase: string, percent: number) => void;
}): Promise<SeparationResult> {
  const { inputVideo, cacheDir, signal, onProgress } = options;
  if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
  const model = getDemucsModel();
  onProgress?.("Checking separated-audio cache", 5);
  const sourceSha256 = await sha256File(inputVideo);
  const cached = await readCachedSeparation(cacheDir, sourceSha256, model);
  if (cached) {
    onProgress?.("Using cached vocals and background", 35);
    return cached;
  }

  const python = await findDemucsPython();
  await fs.mkdir(cacheDir, { recursive: true });
  const workDir = path.join(cacheDir, `.work-${process.pid}-${Date.now()}`);
  const sourceAudio = path.join(workDir, "source.wav");
  const demucsOutput = path.join(workDir, "demucs");
  await fs.mkdir(workDir, { recursive: true });

  try {
    onProgress?.("Extracting original audio", 10);
    await runFfmpeg([
      "-y",
      "-i",
      inputVideo,
      "-vn",
      "-c:a",
      "pcm_s16le",
      "-ar",
      "44100",
      "-ac",
      "2",
      sourceAudio,
    ], { signal });

    onProgress?.("Separating vocals, music, and sound effects with Demucs", 18);
    const outcome = await runProcess(
      python.command,
      [...python.prefixArgs, ...buildDemucsArgs(sourceAudio, demucsOutput, model)],
      signal,
    );
    if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
    if (outcome.error) {
      throw new Error(`Unable to start ${python.displayName}: ${outcome.error.message}`);
    }
    if (outcome.code !== 0) {
      const details = outcome.stderr.trim() || outcome.stdout.trim() || `exit code ${outcome.code}`;
      if (/No module named ['"]?demucs/i.test(details)) {
        throw new Error("Demucs is not installed. Run: python -m pip install demucs");
      }
      throw new Error(`Demucs separation failed: ${details}`);
    }

    const separated = getDemucsOutputPaths(demucsOutput, model, sourceAudio);
    await Promise.all([
      validateStem(separated.vocalsPath, "Demucs vocals"),
      validateStem(separated.accompanimentPath, "Demucs accompaniment"),
    ]);

    const suffix = `.tmp-${process.pid}-${Date.now()}`;
    const vocalsPath = path.join(cacheDir, "vocals.wav");
    const accompanimentPath = path.join(cacheDir, "accompaniment.wav");
    const manifestPath = path.join(cacheDir, "manifest.json");
    const tempVocals = `${vocalsPath}${suffix}`;
    const tempAccompaniment = `${accompanimentPath}${suffix}`;
    const tempManifest = `${manifestPath}${suffix}`;
    const manifest: SeparationManifest = {
      version: 1,
      sourceSha256,
      model,
      vocalsFile: "vocals.wav",
      accompanimentFile: "accompaniment.wav",
      createdAt: new Date().toISOString(),
    };

    await Promise.all([
      fs.copyFile(separated.vocalsPath, tempVocals),
      fs.copyFile(separated.accompanimentPath, tempAccompaniment),
    ]);
    await fs.writeFile(tempManifest, JSON.stringify(manifest, null, 2), "utf8");
    await Promise.all([
      fs.rm(vocalsPath, { force: true }),
      fs.rm(accompanimentPath, { force: true }),
      fs.rm(manifestPath, { force: true }),
    ]);
    await Promise.all([
      fs.rename(tempVocals, vocalsPath),
      fs.rename(tempAccompaniment, accompanimentPath),
    ]);
    await fs.rename(tempManifest, manifestPath);
    onProgress?.("Separated audio cached in the project", 35);
    return { vocalsPath, accompanimentPath, sourceSha256, model, cacheHit: false };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
