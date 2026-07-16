import { spawn } from "child_process";

import { OllamaClient, getTranslationModel } from "./ai/ollama-client";

export type DependencyHealth = { ok: boolean; message: string };

async function commandHealth(command: string, args: string[]): Promise<DependencyHealth> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    child.once("error", () => resolve({ ok: false, message: `${command} was not found on PATH.` }));
    child.once("close", (code) => resolve(code === 0 ? { ok: true, message: `${command} is available.` } : { ok: false, message: `${command} exited with code ${code}.` }));
  });
}

export async function validateStartup() {
  const [ffmpeg, ffprobe, ollama] = await Promise.all([
    commandHealth("ffmpeg", ["-version"]),
    commandHealth("ffprobe", ["-version"]),
    new OllamaClient({ model: getTranslationModel() }).health(),
  ]);
  return {
    ok: ffmpeg.ok && ffprobe.ok && ollama.ok,
    services: { ffmpeg, ffprobe, ollama: { ok: ollama.ok, message: ollama.ok ? `Ollama model ${ollama.model} is ready.` : ollama.error ?? "Ollama is unavailable." } },
  };
}
