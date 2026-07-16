import { NextResponse } from "next/server";

import { JOB_TYPES, jobQueue, type JobType } from "@/lib/queue";
import { getCurrentSession } from "@/lib/services/auth-context";

export async function GET() {
  const session = await getCurrentSession();
  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await jobQueue.list(userId);
  return NextResponse.json({ success: true, jobs });
}

export async function POST(request: Request) {
  const session = await getCurrentSession();
  const userId = session?.user.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { type?: string; projectId?: string; payload?: object };
  if (!body.type || !JOB_TYPES.includes(body.type as JobType)) {
    return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
  }
  const job = await jobQueue.enqueue({
    userId,
    projectId: body.projectId,
    type: body.type as JobType,
    payload: body.payload ?? {},
  });
  return NextResponse.json({ success: true, job }, { status: 202 });
}
