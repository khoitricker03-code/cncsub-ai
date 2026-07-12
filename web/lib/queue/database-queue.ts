import type { JobType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { JobHandler, JobQueue } from "./types";

export class DatabaseJobQueue implements JobQueue {
  private readonly handlers = new Map<JobType, JobHandler>();
  private readonly controllers = new Map<string, AbortController>();

  register(type: JobType, handler: JobHandler) {
    this.handlers.set(type, handler);
  }

  async enqueue(input: { userId: string; projectId?: string; type: JobType; payload: object }) {
    const job = await prisma.job.create({
      data: {
        userId: input.userId,
        projectId: input.projectId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
      },
    });
    setImmediate(() => void this.run(job.id));
    return { id: job.id };
  }

  private async run(jobId: string) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.status !== "QUEUED") return;
    const handler = this.handlers.get(job.type);
    const controller = new AbortController();
    this.controllers.set(jobId, controller);

    await prisma.job.update({
      where: { id: jobId },
      data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
    });

    try {
      if (!handler) throw new Error(`No worker registered for ${job.type}`);
      const result = await handler({
        jobId,
        userId: job.userId,
        projectId: job.projectId ?? undefined,
        payload: job.payload,
        signal: controller.signal,
        reportProgress: async (progress) => {
          await prisma.job.update({
            where: { id: jobId },
            data: { progress: Math.min(99, Math.max(0, Math.round(progress))) },
          });
        },
      });
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "COMPLETED",
          progress: 100,
          result: result as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
    } catch (error) {
      const cancelled = controller.signal.aborted;
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: cancelled ? "CANCELLED" : "FAILED",
          error: error instanceof Error ? error.message : "Job failed",
          finishedAt: new Date(),
        },
      });
    } finally {
      this.controllers.delete(jobId);
    }
  }

  async cancel(userId: string, jobId: string) {
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
    if (!job || !["QUEUED", "RUNNING"].includes(job.status)) return false;
    this.controllers.get(jobId)?.abort();
    await prisma.job.update({ where: { id: jobId }, data: { status: "CANCELLED", finishedAt: new Date() } });
    return true;
  }

  async retry(userId: string, jobId: string) {
    const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
    if (!job || job.status !== "FAILED") return null;
    return this.enqueue({
      userId,
      projectId: job.projectId ?? undefined,
      type: job.type,
      payload: job.payload as object,
    });
  }
}

const globalQueue = globalThis as unknown as { cncsubQueue?: DatabaseJobQueue };
export const jobQueue = globalQueue.cncsubQueue ?? new DatabaseJobQueue();
if (process.env.NODE_ENV !== "production") globalQueue.cncsubQueue = jobQueue;
