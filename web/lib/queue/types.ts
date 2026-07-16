export const JOB_TYPES = ["TRANSCRIBE", "BURN", "TRANSLATE", "REWRITE", "EXPORT"] as const;
export type JobType = (typeof JOB_TYPES)[number];
export type JobStatus = "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type JobRecord = {
  id: string; userId: string; projectId?: string; type: JobType; status: JobStatus;
  progress: number; payload: unknown; result?: unknown; error?: string;
  attempts: number; createdAt: string; startedAt?: string; finishedAt?: string;
};

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
  get(userId: string, jobId: string): Promise<JobRecord | null>;
  list(userId: string): Promise<JobRecord[]>;
  register(type: JobType, handler: JobHandler): void;
}
