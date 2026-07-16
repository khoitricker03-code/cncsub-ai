import { NextResponse } from "next/server";

import {
  OllamaClient,
  getLocalAIConfig,
  getTranslationModel,
} from "@/lib/ai/ollama-client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const config = getLocalAIConfig();
  const client = new OllamaClient({ ...config, model: getTranslationModel() });
  const health = await client.health(request.signal);

  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
