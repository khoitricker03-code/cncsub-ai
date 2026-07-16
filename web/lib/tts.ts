import fs from "fs";
import path from "path";
import { spawn } from "child_process";

export type TTSOptions = {
  provider?: "edge" | "kokoro" | "xtts";
  voice?: string;
  rate?: number;
  pitch?: number;
};

export async function synthesizeSegment(text: string, outPath: string, durationSeconds?: number, _opts?: TTSOptions) {
  // Placeholder: generate silent audio of approximate duration so pipeline proceeds.
  // Replace with real provider calls (Edge TTS / Kokoro / XTTS) in production.
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  return new Promise<void>((resolve, reject) => {
    const args = [
      "-f",
      "lavfi",
      "-i",
      `anullsrc=channel_layout=stereo:sample_rate=44100`,
      "-t",
      String(durationSeconds ?? 1),
      "-y",
      outPath,
    ];
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += String(d)));
    p.on("error", (err) => reject(err));
    p.on("close", (code) => {
      if (code === 0) return resolve();
      return reject(new Error(`ffmpeg exited ${code}: ${stderr}`));
    });
  });
}

export async function concatWavs(list: string[], outPath: string) {
  // Create a temporary concat list file
  const tmp = outPath + ".concat.txt";
  const content = list.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n");
  await fs.promises.writeFile(tmp, content, "utf8");
  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", tmp, "-c", "copy", outPath], { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      p.stderr.on("data", (d) => (stderr += String(d)));
      p.on("error", (err) => reject(err));
      p.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg concat exited ${code}: ${stderr}`));
      });
    });
  } finally {
    try { await fs.promises.unlink(tmp); } catch {}
  }
}
