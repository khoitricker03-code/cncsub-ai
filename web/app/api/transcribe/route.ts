import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { NextResponse } from "next/server";
import { createProject } from "@/lib/projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileAsync = promisify(execFile);

const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT = 30 * 60 * 1000;

type SubtitleSegment = {
  id: number;
  start: number;
  end: number;
  text: string;
};

type PythonTranscribeResult = {
  language?: string;
  language_probability?: number;
  text?: string;
  srt?: string;
  segments?: SubtitleSegment[];
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

export async function POST(request: Request) {
  let tempVideoPath = "";

  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        {
          success: false,
          error: "Bạn chưa chọn video.",
        },
        { status: 400 },
      );
    }

    if (video.size === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "File video rỗng.",
        },
        { status: 400 },
      );
    }

    if (video.size > MAX_VIDEO_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: "Video hiện tại phải nhỏ hơn 100 MB.",
        },
        { status: 413 },
      );
    }

    const originalExtension = path.extname(video.name);
    const safeExtension =
      originalExtension.replace(/[^a-zA-Z0-9.]/g, "") || ".mp4";

    const randomPart = Math.random().toString(36).slice(2);

    tempVideoPath = path.join(
      os.tmpdir(),
      `cncsub-${Date.now()}-${randomPart}${safeExtension}`,
    );

    const videoBuffer = Buffer.from(await video.arrayBuffer());
    const project = await createProject(video.name);

const mediaDir = path.join(
  process.cwd(),
  "storage",
  "projects",
  project.id,
  "media",
);

const projectVideoPath = path.join(
  mediaDir,
  "input.mp4",
);
await fs.mkdir(mediaDir, {
  recursive: true,
});
await fs.writeFile(
  projectVideoPath,
  videoBuffer,
);
    const pythonScript = path.join(
      process.cwd(),
      "scripts",
      "transcribe.py",
    );

    await fs.access(pythonScript);

    const { stdout, stderr } = await execFileAsync(
      "python",
      [pythonScript, projectVideoPath],
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

    const result = JSON.parse(jsonLine) as PythonTranscribeResult;

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

    const baseName =
      path.parse(video.name).name.replace(/[^\p{L}\p{N}_-]+/gu, "-") ||
      "subtitle";
      
      const projectRoot = path.join(
  process.cwd(),
  "storage",
  "projects",
  project.id,
);

const transcriptDir = path.join(
  projectRoot,
  "transcript",
);
await fs.writeFile(
  path.join(transcriptDir, "subtitle.srt"),
  result.srt ?? "",
  "utf8",
);

await fs.writeFile(
  path.join(transcriptDir, "transcript.txt"),
  result.text ?? "",
  "utf8",
);

await fs.writeFile(
  path.join(transcriptDir, "segments.json"),
  JSON.stringify(segments, null, 2),
  "utf8",
);

    return NextResponse.json({
      success: true,
      projectId: project.id,
      filename: `${baseName}.srt`,
      textFilename: `${baseName}.txt`,
      language: result.language ?? "unknown",
      languageProbability: result.language_probability ?? 0,
      text: result.text ?? "",
      srt: result.srt ?? "",
      segments,
    });
  } catch (error) {
    console.error("Transcribe API error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Không thể tạo phụ đề.";

    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  } finally {
    if (tempVideoPath) {
      await fs.unlink(tempVideoPath).catch(() => undefined);
    }
  }
}