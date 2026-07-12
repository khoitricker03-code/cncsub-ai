import { JobType } from "@prisma/client";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { jobQueue } from "@/lib/queue/database-queue";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.job.findMany({ where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ success: true, jobs });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { type?: string; projectId?: string; payload?: object };
  if (!body.type || !Object.values(JobType).includes(body.type as JobType)) {
    return NextResponse.json({ error: "Invalid job type" }, { status: 400 });
  }
  const job = await jobQueue.enqueue({
    userId: session.user.id,
    projectId: body.projectId,
    type: body.type as JobType,
    payload: body.payload ?? {},
  });
  return NextResponse.json({ success: true, job }, { status: 202 });
}
