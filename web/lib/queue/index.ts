import { DatabaseJobQueue } from "./database-queue";
import { LocalJobQueue } from "./local-queue";
import type { JobQueue } from "./types";

const useLocal = process.env.JOB_QUEUE === "local" || process.env.NODE_ENV !== "production";
const globalQueue = globalThis as unknown as { cncsubQueue?: JobQueue };
export const jobQueue = globalQueue.cncsubQueue ?? (useLocal ? new LocalJobQueue() : new DatabaseJobQueue());
if (process.env.NODE_ENV !== "production") globalQueue.cncsubQueue = jobQueue;
export * from "./types";
