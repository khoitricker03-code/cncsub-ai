import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

import { runDubbingJob } from "@/lib/dub";
import { getDemucsHealth } from "@/lib/demucs";
import { burnSubtitle, replaceAudio } from "@/lib/ffmpeg";
import { logger } from "@/lib/logger";
import { authorizeProject } from "@/lib/services/access-service";
import {
  getProjectRoot,
  getProjectVideoPath,
  loadProjectWorkspace,
  saveMixedFile,
  saveRenderedVideo,
  saveVoiceFile,
} from "@/lib/storage";
import { parseDubbingOptions } from "@/lib/tts-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DubJobStatus = "running" | "completed" | "failed" | "cancelled";

type DubJob = {
  status: DubJobStatus;
  progress: number;
  phase: string;
  error: string | null;
  controller: AbortController;
};

type DubJobStore = { __dubJobs?: Map<string, DubJob> };

function getJobStore() {
  const store = global as unknown as DubJobStore;
  store.__dubJobs ??= new Map();
  return store.__dubJobs;
}

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

function publicJob(job: DubJob) {
  return {
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    error: job.error,
  };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const projectId = formValue(form, "projectId") ?? null;
    if (!projectId) {
      return NextResponse.json({ success: false, error: "Missing projectId" }, { status: 400 });
    }
    if (!(await authorizeProject(projectId))) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const [workspace, originalVideo] = await Promise.all([
      loadProjectWorkspace(projectId),
      getProjectVideoPath(projectId),
    ]);
    if (!workspace) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }
    const translatedSegments = workspace.translatedSegments;
    if (!translatedSegments?.length) {
      return NextResponse.json(
        { success: false, error: "Translate and save subtitles before starting AI Dubbing." },
        { status: 409 },
      );
    }

    const root = getProjectRoot(projectId);
    if (!root || !originalVideo) {
      return NextResponse.json({ success: false, error: "Project video not found" }, { status: 404 });
    }
    const subtitleFile = path.join(root, "transcript", "translated.srt");
    try {
      await fs.access(subtitleFile);
    } catch {
      return NextResponse.json(
        { success: false, error: "Translated subtitle file not found" },
        { status: 409 },
      );
    }

    let options;
    try {
      options = parseDubbingOptions({
        provider: formValue(form, "provider"),
        voice: formValue(form, "voice"),
        rate: formValue(form, "rate"),
        pitch: formValue(form, "pitch"),
        language: formValue(form, "language") ?? workspace.translationLanguage ?? "en",
        mode: formValue(form, "mode"),
        voiceVolume: formValue(form, "voiceVolume"),
        backgroundVolume: formValue(form, "backgroundVolume"),
      });
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : String(error) },
        { status: 400 },
      );
    }

    if (options.mode === "replace-vocals") {
      const demucs = await getDemucsHealth();
      if (!demucs.ok) {
        return NextResponse.json(
          {
            success: false,
            error: `${demucs.message} Replace Voice Only is unavailable. Choose Replace Entire Audio to continue.`,
            fallbackMode: "replace-all",
          },
          { status: 503 },
        );
      }
    }

    const controller = new AbortController();
    const jobId = `dub-job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const jobMap = getJobStore();
    jobMap.set(jobId, {
      status: "running",
      progress: 0,
      phase: "queued",
      error: null,
      controller,
    });

    const workDir = path.join(root, "render", `dub-${Date.now()}`);
    await fs.mkdir(workDir, { recursive: true });

    void (async () => {
      const update = (phase: string, progress: number) => {
        const current = jobMap.get(jobId);
        if (!current || current.status !== "running" || controller.signal.aborted) return;
        current.phase = phase;
        current.progress = Math.max(0, Math.min(99, progress));
      };

      try {
        update("preparing", 3);
        const { voicePath, mixedPath } = await runDubbingJob(
          originalVideo,
          translatedSegments,
          workDir,
          {
            ...options,
            separationCacheDir: path.join(root, "separation"),
            signal: controller.signal,
          },
          update,
        );

        await Promise.all([
          saveVoiceFile(projectId, voicePath),
          saveMixedFile(projectId, mixedPath),
        ]);

        update("replacing original audio", 84);
        const mixedVideo = path.join(workDir, "mixed.mp4");
        await replaceAudio({
          inputVideo: originalVideo,
          audioFile: mixedPath,
          outputVideo: mixedVideo,
          signal: controller.signal,
        });

        update("burning translated subtitles", 90);
        const finalVideo = path.join(workDir, "final.mp4");
        await burnSubtitle({
          inputVideo: mixedVideo,
          subtitleFile,
          outputVideo: finalVideo,
          hardwareAcceleration: "auto",
          signal: controller.signal,
          onProgress(percent) {
            update("burning translated subtitles", 90 + Math.round(percent / 10));
          },
        });

        await saveRenderedVideo(projectId, finalVideo);
        jobMap.set(jobId, {
          status: "completed",
          progress: 100,
          phase: "completed",
          error: null,
          controller,
        });
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
          jobMap.set(jobId, {
            status: "cancelled",
            progress: jobMap.get(jobId)?.progress ?? 0,
            phase: "cancelled",
            error: null,
            controller,
          });
        } else {
          logger.error("dub.job_failed", error);
          jobMap.set(jobId, {
            status: "failed",
            progress: jobMap.get(jobId)?.progress ?? 0,
            phase: "error",
            error: error instanceof Error ? error.message : String(error),
            controller,
          });
        }
      } finally {
        try {
          await fs.rm(workDir, { recursive: true, force: true });
        } catch (error) {
          logger.error("dub.workdir_cleanup_failed", error);
        }
      }
    })();

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    logger.error("dub.start_failed", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ success: false, error: "Missing jobId" }, { status: 400 });
  }
  const job = getJobStore().get(jobId);
  if (!job) {
    return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, ...publicJob(job) });
}

export async function DELETE(request: Request) {
  const jobId = new URL(request.url).searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ success: false, error: "Missing jobId" }, { status: 400 });
  }
  const job = getJobStore().get(jobId);
  if (!job) {
    return NextResponse.json({ success: false, error: "Job not found" }, { status: 404 });
  }
  if (job.status === "running") {
    job.controller.abort();
    job.status = "cancelled";
    job.phase = "cancelled";
  }
  return NextResponse.json({ success: true, ...publicJob(job) });
}
