import { createReadStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { NextResponse } from "next/server";

import { renderDubbedVideo } from "@/lib/dubbing";
import { authorizeProject } from "@/lib/services/access-service";
import { getProjectRoot, getProjectVideoPath } from "@/lib/storage";
import { isSubtitleSegment, type SubtitleSegment } from "@/lib/subtitles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

function outputPath(projectRoot: string) {
  return path.join(projectRoot, "render", "dubbed.mp4");
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { projectId } = await context.params;
    if (!(await authorizeProject(projectId))) {
      return NextResponse.json({ success: false, error: "Không tìm thấy project." }, { status: 404 });
    }
    const [inputVideo, root] = await Promise.all([
      getProjectVideoPath(projectId),
      Promise.resolve(getProjectRoot(projectId)),
    ]);
    if (!inputVideo || !root) {
      return NextResponse.json({ success: false, error: "Không tìm thấy video gốc." }, { status: 404 });
    }
    const body = (await request.json()) as {
      segments?: SubtitleSegment[];
      language?: string;
      backgroundVolume?: number;
    };
    if (!Array.isArray(body.segments) || !body.segments.every(isSubtitleSegment)) {
      return NextResponse.json({ success: false, error: "Phụ đề đã dịch không hợp lệ." }, { status: 400 });
    }
    const result = await renderDubbedVideo({
      inputVideo,
      outputVideo: outputPath(root),
      segments: body.segments,
      language: body.language || "vi",
      backgroundVolume: body.backgroundVolume,
      signal: request.signal,
    });
    await fs.writeFile(
      path.join(root, "render", "dubbing.json"),
      JSON.stringify({ ...result, outputVideo: "render/dubbed.mp4", updatedAt: new Date().toISOString() }, null, 2),
      "utf8",
    );
    return NextResponse.json({
      success: true,
      videoUrl: `/api/projects/${projectId}/dub`,
      provider: result.ttsProvider,
      segmentCount: result.segmentCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Không thể tạo video lồng tiếng.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!(await authorizeProject(projectId))) {
    return NextResponse.json({ success: false, error: "Không tìm thấy project." }, { status: 404 });
  }
  const root = getProjectRoot(projectId);
  if (!root) return NextResponse.json({ success: false, error: "Project không hợp lệ." }, { status: 400 });
  const filePath = outputPath(root);
  try {
    const file = await fs.stat(filePath);
    const range = request.headers.get("range");
    if (!range) {
      return new Response(Readable.toWeb(createReadStream(filePath)) as ReadableStream, {
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(file.size),
          "Content-Type": "video/mp4",
          "Cache-Control": "private, no-store",
        },
      });
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    const start = Number(match[1]);
    const end = Math.min(match[2] ? Number(match[2]) : file.size - 1, file.size - 1);
    if (start >= file.size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${file.size}` } });
    }
    return new Response(
      Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream,
      {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
          "Content-Range": `bytes ${start}-${end}/${file.size}`,
          "Content-Type": "video/mp4",
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch {
    return NextResponse.json({ success: false, error: "Chưa có video lồng tiếng." }, { status: 404 });
  }
}
