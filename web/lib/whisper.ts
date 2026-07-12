import { execFile } from "child_process";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const TRANSCRIBE_TIMEOUT = 30 * 60 * 1000;

export type SubtitleSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

export type WhisperResult = {
  language: string;
  languageProbability: number;
  text: string;
  srt: string;
  segments: SubtitleSegment[];
};

type PythonTranscribeResult = {
  language?: string;
  language_probability?: number;
  text?: string;
  srt?: string;
  segments?: unknown[];
  error?: string;
};

function isValidSegment(value: unknown): value is SubtitleSegment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const segment = value as Record<string, unknown>;

  return (
    typeof segment.id === "number" &&
    typeof segment.start === "number" &&
    typeof segment.end === "number" &&
    typeof segment.text === "string"
  );
}

function parsePythonOutput(stdout: string): PythonTranscribeResult {
  const outputLines = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  const jsonLine = [...outputLines]
    .reverse()
    .find((line) => line.trim().startsWith("{"));

  if (!jsonLine) {
    throw new Error(
      "Python không trả về JSON hợp lệ. Hãy kiểm tra transcribe.py.",
    );
  }

  try {
    return JSON.parse(jsonLine) as PythonTranscribeResult;
  } catch {
    throw new Error("Không thể đọc kết quả JSON từ Whisper.");
  }
}

export async function transcribeVideo(
  videoPath: string,
): Promise<WhisperResult> {
  const pythonScript = path.join(
    process.cwd(),
    "scripts",
    "transcribe.py",
  );

  const { stdout, stderr } = await execFileAsync(
    "python",
    [pythonScript, videoPath],
    {
      cwd: process.cwd(),
      windowsHide: true,
      maxBuffer: 50 * 1024 * 1024,
      timeout: TRANSCRIBE_TIMEOUT,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        PYTHONUTF8: "1",
      },
    },
  );

  if (stderr.trim()) {
    console.log("Whisper:", stderr);
  }

  const result = parsePythonOutput(stdout);

  if (result.error) {
    throw new Error(result.error);
  }

  const segments = Array.isArray(result.segments)
    ? result.segments.filter(isValidSegment)
    : [];

  if (segments.length === 0) {
    throw new Error(
      "Không tạo được phụ đề. Video có thể không có tiếng nói.",
    );
  }

  return {
    language: result.language ?? "unknown",
    languageProbability: result.language_probability ?? 0,
    text: result.text ?? "",
    srt: result.srt ?? "",
    segments,
  };
}