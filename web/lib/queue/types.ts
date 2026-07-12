import type { JobType } from "@prisma/client";

export type JobContext = {
  jobId: string;
  userId: string;
  projectId?: string;
  payload: unknown;
  signal: AbortSignal;
  reportProgress: (progress: number) => Promise<void>;
};

export type JobHandler = (context: JobContext) => Promise<unknown>;

export interface JobQueue {
  enqueue(input: { userId: string; projectId?: string; type: JobType; payload: object }): Promise<{ id: string }>;
  cancel(userId: string, jobId: string): Promise<boolean>;
  retry(userId: string, jobId: string): Promise<{ id: string } | null>;
}
