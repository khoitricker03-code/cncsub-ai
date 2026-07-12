import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { createRewriteEngine } from "./providers";
import type { RewriteMode } from "./rewrite";
import type { SubtitleSegment } from "./subtitles";

export async function rewriteWithCache(
  projectRoot: string,
  mode: RewriteMode,
  segments: SubtitleSegment[],
  signal?: AbortSignal,
): Promise<SubtitleSegment[]> {
  const directory = path.join(projectRoot, "rewrite", "cache", mode);
  await fs.mkdir(directory, { recursive: true });
  const values = new Map<number, string>();
  const missing: SubtitleSegment[] = [];

  for (const segment of segments) {
    const hash = createHash("sha256").update(segment.text).digest("hex");

    try {
      const cached = JSON.parse(
        await fs.readFile(path.join(directory, `${hash}.json`), "utf8"),
      ) as { source: string; rewritten: string };

      if (cached.source === segment.text && typeof cached.rewritten === "string") {
        values.set(segment.id, cached.rewritten);
        continue;
      }
    } catch {
      // Cache misses are sent to the provider below.
    }

    missing.push(segment);
  }

  if (missing.length > 0) {
    const engine = createRewriteEngine();
    const rewritten = await engine.batchRewrite(missing, mode, signal);

    await Promise.all(
      rewritten.map(async (item, index) => {
        const source = missing[index];
        const hash = createHash("sha256").update(source.text).digest("hex");
        values.set(item.id, item.text);
        await fs.writeFile(
          path.join(directory, `${hash}.json`),
          JSON.stringify({ source: source.text, rewritten: item.text }, null, 2),
          "utf8",
        );
      }),
    );
  }

  return segments.map((segment) => ({
    ...segment,
    text: values.get(segment.id) ?? segment.text,
  }));
}
