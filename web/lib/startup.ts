import { spawn } from "child_process";

import { OllamaClient, getTranslationModel } from "./ai/ollama-client";
import { getDemucsHealth } from "./demucs";
import { getEdgeTtsHealth } from "./tts";

export type DependencyHealth = { ok: boolean; message: string };

async function commandHealth(command: string, args: string[]): Promise<DependencyHealth> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let settled = false;
    const finish = (health: DependencyHealth) => {
      if (settled) return;
      settled = true;
      resolve(health);
    };
    child.once("error", () => finish({ ok: false, message: `${command} was not found on PATH.` }));
    child.once("close", (code) => finish(code === 0 ? { ok: true, message: `${command} is available.` } : { ok: false, message: `${command} exited with code ${code}.` }));
  });
}

export async function validateStartup() {
  const [ffmpeg, ffprobe, edgeTts, demucs, ollama] = await Promise.all([
    commandHealth("ffmpeg", ["-version"]),
    commandHealth("ffprobe", ["-version"]),
    getEdgeTtsHealth(),
    getDemucsHealth(),
    new OllamaClient({ model: getTranslationModel() }).health(),
  ]);
  return {
    ok: ffmpeg.ok && ffprobe.ok && edgeTts.ok && ollama.ok,
    services: {
      ffmpeg,
      ffprobe,
      edgeTts,
      demucs: {
        ...demucs,
        required: false,
      },
      ollama: {
        ok: ollama.ok,
        message: ollama.ok ? `Ollama model ${ollama.model} is ready.` : ollama.error ?? "Ollama is unavailable.",
      },
    },
  };
}
