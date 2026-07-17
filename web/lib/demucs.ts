import { spawn } from "child_process";
import { createHash } from "crypto";
import { createReadStream } from "fs";
import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";

import { probeAudio, runFfmpeg } from "./ffmpeg.ts";

export type DemucsPythonCommand = {
  command: string;
  prefixArgs: string[];
  displayName: string;
};

export type DemucsProbeResult = "ready" | "module-missing" | "unavailable";
export type DemucsProbe = (candidate: DemucsPythonCommand) => Promise<DemucsProbeResult>;

export type DemucsProcessOutcome = {
  code: number | null;
  stdout: string;
  stderr: string;
  error?: NodeJS.ErrnoException;
  timedOut?: boolean;
};

type RunProcessOptions = {
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  onStdout?: (value: string) => void;
  onStderr?: (value: string) => void;
};

export type DemucsProgressUpdate = {
  kind: "download" | "separation";
  percent: number;
  phase: string;
};

export type DemucsModelCachePaths = {
  root: string;
  torchHome: string;
  huggingFaceHome: string;
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

const MAX_PROCESS_OUTPUT = 200_000;
const DEFAULT_DEMUCS_TIMEOUT_MS = 30 * 60 * 1_000;
const HF_AUTH_WARNING = /unauthenticated requests to the HF Hub/i;

function appendOutput(current: string, value: string) {
  const next = current + value;
  return next.length > MAX_PROCESS_OUTPUT ? next.slice(-MAX_PROCESS_OUTPUT) : next;
}

function runProcess(
  command: string,
  args: string[],
  options: RunProcessOptions = {},
): Promise<DemucsProcessOutcome> {
  return new Promise((resolve) => {
    const { signal, env, timeoutMs, onStdout, onStderr } = options;
    if (signal?.aborted) {
      resolve({
        code: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("Operation cancelled"), { code: "ABORT_ERR" }),
      });
      return;
    }

    const child = spawn(command, args, { windowsHide: true, env });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let timeout: NodeJS.Timeout | undefined;
    const finish = (outcome: DemucsProcessOutcome) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve(outcome);
    };
    const abort = () => child.kill("SIGTERM");
    signal?.addEventListener("abort", abort, { once: true });
    if (timeoutMs) {
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, timeoutMs);
    }
    child.stdout.on("data", (chunk) => {
      const value = String(chunk);
      stdout = appendOutput(stdout, value);
      onStdout?.(value);
    });
    child.stderr.on("data", (chunk) => {
      const value = String(chunk);
      stderr = appendOutput(stderr, value);
      onStderr?.(value);
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      finish({ code: null, stdout, stderr, error, timedOut });
    });
    child.once("close", (code) => finish({ code, stdout, stderr, timedOut }));
  });
}

function stripTerminalFormatting(value: string) {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\r/g, "\n");
}

function cleanOutput(value: string, omitHuggingFaceWarning = false) {
  const lines = stripTerminalFormatting(value)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && (!omitHuggingFaceWarning || !HF_AUTH_WARNING.test(line)));
  const deduplicated = lines.filter((line, index) => line !== lines[index - 1]);
  return deduplicated.slice(-80).join("\n").slice(-12_000);
}

function classifyDemucsFailure(value: string) {
  if (/ENOSPC|no space left|disk quota|not enough (?:free )?space/i.test(value)) {
    return "Cause: the model or separated audio could not be written because disk space is unavailable.";
  }
  if (/EACCES|EPERM|PermissionError|permission denied|access is denied|WinError\s*5/i.test(value)) {
    return "Cause: the Demucs model cache or output directory is not writable.";
  }
  if (/FileNotFoundError|ENOENT|No such file or directory|cannot find the path specified/i.test(value)) {
    return "Cause: a required Demucs model-cache or output path does not exist or cannot be resolved.";
  }
  if (/ETIMEDOUT|TimeoutError|timed? out/i.test(value)) {
    return "Cause: the Demucs model download or separation timed out.";
  }
  if (/ConnectionError|ConnectTimeout|ReadTimeout|NameResolutionError|Temporary failure in name resolution|CERTIFICATE_VERIFY_FAILED|proxy error|HTTPError|status code (?:401|403|408|429|5\d\d)|\b(?:401|403|408|429) Client Error\b/i.test(value)) {
    return "Cause: the Demucs model download failed because of a network, proxy, certificate, authentication, or rate-limit error.";
  }
  return null;
}

function formatCapturedOutput(outcome: DemucsProcessOutcome) {
  const stdout = cleanOutput(outcome.stdout);
  const stderr = cleanOutput(outcome.stderr, true);
  const sections = [];
  if (stderr) sections.push(`stderr:\n${stderr}`);
  if (stdout) sections.push(`stdout:\n${stdout}`);
  if (HF_AUTH_WARNING.test(outcome.stderr)) {
    sections.push("Non-fatal warning ignored: Hugging Face Hub authentication is not configured.");
  }
  return sections.join("\n\n");
}

export function getDemucsFailure(
  outcome: DemucsProcessOutcome,
  displayName = "python",
): string | null {
  if (!outcome.error && !outcome.timedOut && outcome.code === 0) return null;
  const combined = `${outcome.stderr}\n${outcome.stdout}`;
  if (/No module named ['\"]?demucs/i.test(combined)) {
    return "Demucs is not installed. Run: python -m pip install demucs";
  }

  const header = outcome.timedOut
    ? `Demucs timed out after ${Math.round(getDemucsTimeoutMs() / 1_000)} seconds.`
    : outcome.error
      ? `Unable to start Demucs through ${displayName}: ${outcome.error.message}`
      : `Demucs exited with code ${outcome.code ?? "unknown"}.`;
  const cause = classifyDemucsFailure(combined);
  const output = formatCapturedOutput(outcome);
  return [header, cause, output].filter(Boolean).join("\n\n");
}

export function parseDemucsProgress(value: string): DemucsProgressUpdate | null {
  const output = stripTerminalFormatting(value);
  const lines = output.split("\n").map((line) => line.trim()).filter(Boolean);
  const progressLine = lines.filter((line) => /(\d{1,3}(?:\.\d+)?)%\|/.test(line)).at(-1);
  if (!progressLine) {
    return lines.some((line) => /Downloading:\s*[\"']/i.test(line))
      ? { kind: "download", percent: 0, phase: "Downloading Demucs model" }
      : null;
  }
  const percent = Math.max(
    0,
    Math.min(100, Number(progressLine.match(/(\d{1,3}(?:\.\d+)?)%\|/)?.[1] ?? Number.NaN)),
  );
  if (!Number.isFinite(percent)) return null;
  if (/(?:[KMGT]i?B|bytes)\/s|\/\s*\d+(?:\.\d+)?[KMGT]i?B/i.test(progressLine)) {
    return { kind: "download", percent, phase: `Downloading Demucs model (${Math.round(percent)}%)` };
  }
  if (/seconds\/s|\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s*\[/i.test(progressLine)) {
    return { kind: "separation", percent, phase: `Separating vocals and background (${Math.round(percent)}%)` };
  }
  return null;
}

export function getDemucsTimeoutMs(value = process.env.DEMUCS_TIMEOUT_MS) {
  if (!value) return DEFAULT_DEMUCS_TIMEOUT_MS;
  const timeout = Number(value);
  if (!Number.isFinite(timeout) || timeout < 60_000 || timeout > 24 * 60 * 60 * 1_000) {
    throw new Error("DEMUCS_TIMEOUT_MS must be between 60000 and 86400000 milliseconds.");
  }
  return Math.round(timeout);
}

export function getDemucsModelCachePaths(override?: string): DemucsModelCachePaths {
  const configured = (override ?? process.env.DEMUCS_CACHE_DIR)?.trim();
  const platformCache = process.platform === "win32"
    ? path.join(process.env.LOCALAPPDATA || homedir(), "CNCSubAI", "demucs")
    : path.join(process.env.XDG_CACHE_HOME || path.join(homedir(), ".cache"), "cncsub-ai", "demucs");
  const root = configured ? path.resolve(configured) : platformCache;
  return {
    root,
    torchHome: path.join(root, "torch"),
    huggingFaceHome: path.join(root, "huggingface"),
  };
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

async function containsFile(directory: string, depth = 4): Promise<boolean> {
  if (depth < 0) return false;
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isFile()) {
      const stat = await fs.stat(entryPath).catch(() => null);
      if (stat && stat.size > 1_000_000 && !/\.(?:lock|partial)$/i.test(entry.name)) return true;
    }
    if (entry.isDirectory() && await containsFile(entryPath, depth - 1)) {
      return true;
    }
  }
  return false;
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
  const modelCache = getDemucsModelCachePaths();
  try {
    await Promise.all([
      fs.mkdir(modelCache.torchHome, { recursive: true }),
      fs.mkdir(modelCache.huggingFaceHome, { recursive: true }),
      fs.mkdir(path.join(modelCache.torchHome, "hub", "checkpoints"), { recursive: true }),
      fs.mkdir(path.join(modelCache.huggingFaceHome, "hub"), { recursive: true }),
    ]);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to prepare the Demucs model cache at ${modelCache.root}: ${details}`);
  }
  const modelWasCached = await containsFile(modelCache.root);
  const modelPhase = modelWasCached
    ? "Using cached Demucs model"
    : "Preparing automatic Demucs model download";
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

    onProgress?.(modelPhase, 15);
    onProgress?.(
      modelWasCached ? "Starting Demucs with the cached model" : "Downloading the Demucs model if needed",
      18,
    );
    let progressBuffer = "";
    let reportedProgress = 18;
    let reportedPhase = "";
    let emittedProgress = -1;
    const reportProcessProgress = (value: string) => {
      progressBuffer = (progressBuffer + value).slice(-8_000);
      const progress = parseDemucsProgress(progressBuffer);
      if (!progress) return;
      const mapped = progress.kind === "download"
        ? 18 + Math.round(progress.percent * 0.06)
        : 24 + Math.round(progress.percent * 0.10);
      reportedProgress = Math.max(reportedProgress, mapped);
      if (reportedPhase === progress.phase && emittedProgress === reportedProgress) return;
      reportedPhase = progress.phase;
      emittedProgress = reportedProgress;
      onProgress?.(progress.phase, Math.min(34, reportedProgress));
    };
    const outcome = await runProcess(
      python.command,
      [...python.prefixArgs, ...buildDemucsArgs(sourceAudio, demucsOutput, model)],
      {
        signal,
        timeoutMs: getDemucsTimeoutMs(),
        env: {
          ...process.env,
          TORCH_HOME: modelCache.torchHome,
          HF_HOME: modelCache.huggingFaceHome,
          HF_HUB_CACHE: path.join(modelCache.huggingFaceHome, "hub"),
          HUGGINGFACE_HUB_CACHE: path.join(modelCache.huggingFaceHome, "hub"),
        },
        onStdout: reportProcessProgress,
        onStderr: reportProcessProgress,
      },
    );
    if (signal?.aborted) throw new DOMException("Operation cancelled", "AbortError");
    const failure = getDemucsFailure(outcome, python.displayName);
    if (failure) throw new Error(failure);

    const separated = getDemucsOutputPaths(demucsOutput, model, sourceAudio);
    try {
      await Promise.all([
        validateStem(separated.vocalsPath, "Demucs vocals"),
        validateStem(separated.accompanimentPath, "Demucs accompaniment"),
      ]);
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      const output = formatCapturedOutput(outcome);
      throw new Error([
        `Demucs exited with code 0 but did not produce valid separated audio: ${details}`,
        output,
      ].filter(Boolean).join("\n\n"));
    }

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
    onProgress?.(
      modelWasCached
        ? "Separated audio cached in the project"
        : "Demucs model and separated audio cached for future runs",
      35,
    );
    return { vocalsPath, accompanimentPath, sourceSha256, model, cacheHit: false };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
