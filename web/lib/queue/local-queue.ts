import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type { JobHandler, JobQueue, JobRecord, JobType } from "./types";

export class LocalJobQueue implements JobQueue {
  private readonly handlers = new Map<JobType, JobHandler>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly directory: string;

  constructor(directory = path.join(process.cwd(), "storage", "jobs")) { this.directory = directory; }
  register(type: JobType, handler: JobHandler) { this.handlers.set(type, handler); }
  private file(id: string) { return path.join(this.directory, `${id}.json`); }
  private async write(job: JobRecord) {
    await fs.mkdir(this.directory, { recursive: true });
    const temporary = `${this.file(job.id)}.tmp-${process.pid}`;
    await fs.writeFile(temporary, JSON.stringify(job, null, 2), "utf8");
    await fs.rename(temporary, this.file(job.id));
  }
  private async read(id: string): Promise<JobRecord | null> {
    try { return JSON.parse(await fs.readFile(this.file(id), "utf8")) as JobRecord; } catch { return null; }
  }
  async enqueue(input: { userId: string; projectId?: string; type: JobType; payload: object }) {
    const job: JobRecord = { id: randomUUID(), ...input, status: "QUEUED", progress: 0, attempts: 0, createdAt: new Date().toISOString() };
    await this.write(job);
    setImmediate(() => void this.run(job.id));
    return { id: job.id };
  }
  private async run(id: string) {
    const job = await this.read(id);
    if (!job || job.status !== "QUEUED") return;
    const handler = this.handlers.get(job.type);
    const controller = new AbortController();
    this.controllers.set(id, controller);
    Object.assign(job, { status: "RUNNING", startedAt: new Date().toISOString(), attempts: job.attempts + 1 });
    await this.write(job);
    try {
      if (!handler) throw new Error(`No local worker registered for ${job.type}`);
      job.result = await handler({ jobId: id, userId: job.userId, projectId: job.projectId, payload: job.payload, signal: controller.signal, reportProgress: async (progress) => { job.progress = Math.min(99, Math.max(0, Math.round(progress))); await this.write(job); } });
      Object.assign(job, { status: "COMPLETED", progress: 100, finishedAt: new Date().toISOString(), error: undefined });
    } catch (error) {
      Object.assign(job, { status: controller.signal.aborted ? "CANCELLED" : "FAILED", error: error instanceof Error ? error.message : "Job failed", finishedAt: new Date().toISOString() });
    } finally { this.controllers.delete(id); await this.write(job); }
  }
  async get(userId: string, id: string) { const job = await this.read(id); return job?.userId === userId ? job : null; }
  async list(userId: string) {
    try { const files = (await fs.readdir(this.directory)).filter((file) => file.endsWith(".json")); const jobs = await Promise.all(files.map((file) => this.read(file.slice(0, -5)))); return jobs.filter((job): job is JobRecord => job?.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50); } catch { return []; }
  }
  async cancel(userId: string, id: string) { const job = await this.get(userId, id); if (!job || !["QUEUED", "RUNNING"].includes(job.status)) return false; this.controllers.get(id)?.abort(); Object.assign(job, { status: "CANCELLED", finishedAt: new Date().toISOString() }); await this.write(job); return true; }
  async retry(userId: string, id: string) { const job = await this.get(userId, id); if (!job || job.status !== "FAILED") return null; job.status = "QUEUED"; job.progress = 0; job.error = undefined; job.finishedAt = undefined; await this.write(job); setImmediate(() => void this.run(id)); return { id }; }
}
