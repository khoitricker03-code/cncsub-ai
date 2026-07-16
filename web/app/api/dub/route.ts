import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import { NextResponse } from "next/server";

import { getProjectVideoPath, loadProjectWorkspace, saveVoiceFile, saveMixedFile, saveFinalVideo, getProjectRoot } from "@/lib/storage";
import { runDubbingJob } from "@/lib/dub";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DubJob = { status: string; progress: number; phase?: string; error?: string | null };

export async function POST(request: Request) {
  const form = await request.formData();
  const projectId = typeof form.get("projectId") === "string" ? String(form.get("projectId")) : null;
  if (!projectId) return NextResponse.json({ success: false, error: "Missing projectId" }, { status: 400 });

  const workspace = await loadProjectWorkspace(projectId);
  if (!workspace) return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });

  // Use translated segments if present, otherwise fallback to segments
  const segments = (workspace.translatedSegments && workspace.translatedSegments.length > 0) ? workspace.translatedSegments : workspace.segments;

  type Segment = { id: string; start: number; end: number; text: string };

  const jobId = `dub-job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  (global as unknown as { __dubJobs?: Map<string, DubJob> }).__dubJobs = (global as unknown as { __dubJobs?: Map<string, DubJob> }).__dubJobs || new Map();
  const jobMap: Map<string, DubJob> = (global as unknown as { __dubJobs: Map<string, DubJob> }).__dubJobs;
  jobMap.set(jobId, { status: "running", progress: 0, phase: "queued", error: null });

  // Create working directory inside project's render folder
  const workDir = path.join(getProjectRoot(projectId) || os.tmpdir(), "render", `dub-${Date.now()}`);
  await fs.mkdir(workDir, { recursive: true });

  (async () => {
    try {
      jobMap.set(jobId, { status: "running", progress: 5, phase: "preparing", error: null });

      const segs: Segment[] = segments.map((s: any) => ({ id: s.id, start: s.start, end: s.end, text: s.text }));

      const update = (phase: string, pct: number) => jobMap.set(jobId, { status: "running", progress: pct, phase, error: null });

      const { voicePath, mixedPath } = await runDubbingJob(projectId, segs, workDir, { provider: String(form.get("provider") ?? "edge") }, (phase: string, pct: number) => update(phase, pct));

      // persist
      const savedVoice = await saveVoiceFile(projectId, voicePath);
      const savedMixed = await saveMixedFile(projectId, mixedPath);

      jobMap.set(jobId, { status: "running", progress: 90, phase: "rendering", error: null });

      // Burn subtitles then replace audio: reuse existing burn pipeline by calling ffmpeg directly
      const originalVideo = (await getProjectVideoPath(projectId))!;
      const burned = path.join(workDir, "burned.mp4");
      // Burn subtitles using ffmpeg filter (assumes translated.srt exists in transcript)
      const srtPath = path.join(getProjectRoot(projectId) || "", "transcript", "translated.srt");

      await new Promise<void>((resolve, reject) => {
        const args = ["-y", "-i", originalVideo, "-vf", `subtitles=${srtPath.replace(/\\/g, "\\\\")}`, "-c:v", "libx264", "-c:a", "aac", "-strict", "-2", burned];
        const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        p.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
        p.on("close", (code: number) => (code === 0 ? resolve() : reject(new Error(`ffmpeg burn failed: ${stderr}`))));
      });

      // Replace audio with mixed
      const final = path.join(workDir, "final.mp4");
      await new Promise<void>((resolve, reject) => {
        const args = ["-y", "-i", burned, "-i", mixedPath, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-shortest", final];
        const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
        let stderr = "";
        p.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
        p.on("close", (code: number) => (code === 0 ? resolve() : reject(new Error(`ffmpeg replace audio failed: ${stderr}`))));
      });

      await saveFinalVideo(projectId, final);

      jobMap.set(jobId, { status: "completed", progress: 100, phase: "completed", error: null });
    } catch (err) {
      logger.error("dub.job_failed", err);
      const entry = jobMap.get(jobId);
      jobMap.set(jobId, { status: "failed", progress: entry?.progress ?? 0, phase: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      // keep workDir for debugging; do not delete immediately
    }
  })();

  return NextResponse.json({ success: true, jobId });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId");
    if (!jobId) return NextResponse.json({ success: false, error: "Missing jobId" }, { status: 400 });
    const jobMap: Map<string, DubJob> = (global as unknown as { __dubJobs?: Map<string, DubJob> }).__dubJobs || new Map();
    const entry = jobMap.get(jobId);
    if (!entry) return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
    return NextResponse.json({ success: true, status: entry.status, progress: entry.progress ?? 0, phase: entry.phase ?? null, error: entry.error ?? null });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
