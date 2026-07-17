import { NextResponse } from "next/server";

import { getDemucsHealth } from "@/lib/demucs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const demucs = await getDemucsHealth();
  return NextResponse.json({
    success: true,
    demucs: {
      available: demucs.ok,
      message: demucs.message,
    },
  });
}
