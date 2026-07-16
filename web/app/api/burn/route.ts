import { createReadStream, createWriteStream } from "fs";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { NextResponse } from "next/server";

import { burnSubtitle, type SubtitleStyle } from "@/lib/ffmpeg";
import { logger } from "@/lib/logger";
import { authorizeProject } from "@/lib/services/access-service";
import { getProjectVideoPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_SUBTITLE_SIZE = 10 * 1024 * 1024;

type BurnResponse = { success: boolean; error?: string };

async function saveUploadedFile(file: File, outputPath: string) {
  await pipeline(
    Readable.fromWeb(file.stream() as import("stream/web").ReadableStream),
    createWriteStream(outputPath, { flags: "wx" }),
  );
}

function createJobPaths(videoName = "input.mp4") {
  const jobId = `burn-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const workDir = path.join(os.tmpdir(), jobId);
  const extension = path.extname(videoName).toLowerCase() || ".mp4";
  return {
    workDir,
    inputVideo: path.join(workDir, `input${extension}`),
    subtitleFile: path.join(workDir, "subtitle.srt"),
    outputVideo: path.join(workDir, "output.mp4"),
  };
}

function parseStyle(value: FormDataEntryValue | null): SubtitleStyle | undefined {
  if (typeof value !== "string" || !value) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Kiểu phụ đề không hợp lệ.");
  const style = parsed as Record<string, unknown>;
  return {
    fontFamily: typeof style.fontFamily === "string" ? style.fontFamily : undefined,
    fontSize: typeof style.fontSize === "number" ? style.fontSize : undefined,
    alignment: typeof style.alignment === "number" ? style.alignment : undefined,
    marginV: typeof style.marginV === "number" ? style.marginV : undefined,
    primaryColour: typeof style.primaryColour === "string" ? style.primaryColour : undefined,
    outlineColour: typeof style.outlineColour === "string" ? style.outlineColour : undefined,
    backgroundColour: typeof style.backgroundColour === "string" ? style.backgroundColour : undefined,
    outline: typeof style.outline === "number" ? style.outline : undefined,
    shadow: typeof style.shadow === "number" ? style.shadow : undefined,
  };
}

export async function POST(request: Request) {
  let workDir = "";
  let responseOwnsCleanup = false;

  try {
    const formData = await request.formData();
    const video = formData.get("video");
    const projectId = formData.get("projectId");
    const subtitle = formData.get("subtitle");
    const hardware = formData.get("hardwareAcceleration");

    const hasProject = typeof projectId === "string" && projectId.length > 0;
    const hasUpload = video instanceof File && video.size > 0;
    if (!hasProject && !hasUpload) return NextResponse.json({ success: false, error: "Thiếu video hoặc project." } satisfies BurnResponse, { status: 400 });
    if (!(subtitle instanceof File) || subtitle.size === 0) return NextResponse.json({ success: false, error: "Thiếu file SRT." } satisfies BurnResponse, { status: 400 });
    if (hasUpload && video.size > MAX_VIDEO_SIZE) return NextResponse.json({ success: false, error: "Video phải nhỏ hơn hoặc bằng 500 MB." } satisfies BurnResponse, { status: 413 });
    if (subtitle.size > MAX_SUBTITLE_SIZE) return NextResponse.json({ success: false, error: "File SRT quá lớn." } satisfies BurnResponse, { status: 413 });

    let inputVideo: string | null = null;
    if (hasProject) {
      if (!(await authorizeProject(projectId))) {
        return NextResponse.json({ success: false, error: "Không tìm thấy project." } satisfies BurnResponse, { status: 404 });
      }
      const storedVideo = await getProjectVideoPath(projectId);
      if (!storedVideo) {
        return NextResponse.json({ success: false, error: "Không tìm thấy video gốc của project." } satisfies BurnResponse, { status: 404 });
      }
      inputVideo = storedVideo;
    }

    const paths = createJobPaths(hasUpload ? video.name : undefined);
    workDir = paths.workDir;
    await fs.mkdir(workDir, { recursive: true });
    await saveUploadedFile(subtitle, paths.subtitleFile);
    if (!hasProject && hasUpload) {
      await saveUploadedFile(video, paths.inputVideo);
      inputVideo = paths.inputVideo;
    }
    if (!inputVideo) {
      throw new Error("Không thể xác định video đầu vào.");
    }

    await burnSubtitle({
      inputVideo,
      subtitleFile: paths.subtitleFile,
      outputVideo: paths.outputVideo,
      hardwareAcceleration: hardware === "nvenc" || hardware === "software" ? hardware : "auto",
      style: parseStyle(formData.get("style")),
      signal: request.signal,
    });

    const file = await fs.stat(paths.outputVideo);
    const output = createReadStream(paths.outputVideo);
    const cleanup = () => void fs.rm(paths.workDir, { recursive: true, force: true });
    output.once("close", cleanup);
    output.once("error", cleanup);
    request.signal.addEventListener("abort", () => output.destroy(), { once: true });
    responseOwnsCleanup = true;

    return new Response(Readable.toWeb(output) as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(file.size),
        "Content-Disposition": 'attachment; filename="video_final.mp4"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("burn.failed", error);
    const message = error instanceof Error ? error.message : "Không thể burn phụ đề.";
    return NextResponse.json({ success: false, error: message } satisfies BurnResponse, { status: 500 });
  } finally {
    if (workDir && !responseOwnsCleanup) await fs.rm(workDir, { recursive: true, force: true });
  }
}
