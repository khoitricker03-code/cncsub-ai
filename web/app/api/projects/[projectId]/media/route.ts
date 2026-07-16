import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { generateThumbnail, generateWaveform, probeVideo } from "@/lib/ffmpeg";
import { authorizeProject } from "@/lib/services/access-service";
import { getProjectRoot, getProjectVideoPath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!(await authorizeProject(projectId))) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  const video = await getProjectVideoPath(projectId);
  const root = getProjectRoot(projectId);
  if (!video || !root) return NextResponse.json({ success: false, error: "Project video not found." }, { status: 404 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") ?? "metadata";
  try {
    if (kind === "metadata") return NextResponse.json({ success: true, metadata: await probeVideo(video) });
    const previewDir = path.join(root, "media", "previews");
    await fs.mkdir(previewDir, { recursive: true });
    const isWaveform = kind === "waveform";
    const time = Math.max(0, Number(url.searchParams.get("time") ?? 0));
    const filename = isWaveform ? "waveform.png" : `frame-${Math.round(time * 10)}.jpg`;
    const output = path.join(previewDir, filename);
    try { await fs.access(output); } catch {
      if (isWaveform) await generateWaveform(video, output);
      else await generateThumbnail(video, output, time);
    }
    const body = await fs.readFile(output);
    return new NextResponse(body, { headers: { "Content-Type": isWaveform ? "image/png" : "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media preview failed.";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
