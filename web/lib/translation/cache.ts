import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import { createTranslator } from "./index";
import type { SubtitleSegment } from "@/lib/subtitles";

function cacheKey(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function translateBatchWithCache(
  projectRoot: string,
  targetLanguage: string,
  segments: SubtitleSegment[],
  signal?: AbortSignal,
): Promise<SubtitleSegment[]> {
  const cacheDirectory = path.join(
    projectRoot,
    "translation",
    "cache",
    targetLanguage,
  );
  await fs.mkdir(cacheDirectory, { recursive: true });

  const cachedTexts = new Map<number, string>();
  const missing: SubtitleSegment[] = [];

  await Promise.all(
    segments.map(async (segment) => {
      const file = path.join(cacheDirectory, `${cacheKey(segment.text)}.json`);

      try {
        const cached = JSON.parse(await fs.readFile(file, "utf8")) as {
          source: string;
          translated: string;
        };

        if (cached.source === segment.text && typeof cached.translated === "string") {
          cachedTexts.set(segment.id, cached.translated);
          return;
        }
      } catch {
        // A missing or invalid cache entry is translated again.
      }

      missing.push(segment);
    }),
  );

  if (missing.length > 0) {
    const translator = createTranslator();
    const translated = await translator.translateBatch(
      missing.map(({ id, text }) => ({ id, text })),
      targetLanguage,
      signal,
    );

    await Promise.all(
      translated.map(async (item, index) => {
        const source = missing[index];
        cachedTexts.set(item.id, item.text);
        await fs.writeFile(
          path.join(cacheDirectory, `${cacheKey(source.text)}.json`),
          JSON.stringify({ source: source.text, translated: item.text }, null, 2),
          "utf8",
        );
      }),
    );
  }

  return segments.map((segment) => ({
    ...segment,
    text: cachedTexts.get(segment.id) ?? segment.text,
  }));
}
