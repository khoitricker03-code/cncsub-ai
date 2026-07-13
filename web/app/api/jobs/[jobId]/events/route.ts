import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/services/auth-context";

type Context = { params: Promise<{ jobId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const userId = await getCurrentUserId();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { jobId } = await params;
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const tick = async () => {
        const job = await prisma.job.findFirst({ where: { id: jobId, userId } });
        if (!job) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));
        if (["COMPLETED", "FAILED", "CANCELLED"].includes(job.status)) controller.close();
        else setTimeout(() => void tick(), 1000);
      };
      await tick();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
