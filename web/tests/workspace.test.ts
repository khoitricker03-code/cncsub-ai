import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isValidTextTransform } from "../lib/ai-validation.ts";
import { createContentCacheKey } from "../lib/cache-key.ts";
import { createSubtitleExport, parseSubtitleImport } from "../lib/export.ts";
import {
  OllamaClient,
  getRewriteModel,
  getTranslationModel,
  parseOllamaJSON,
} from "../lib/ai/ollama-client.ts";
import { OllamaTranslator } from "../lib/translation/ollama-translator.ts";
import { isDevelopmentAuthBypassEnabled } from "../lib/services/auth-flags.ts";
import { buildSrt, type SubtitleSegment } from "../lib/subtitles.ts";
import { buildTempoFilters } from "../lib/dubbing.ts";
import { createSubtitleFilterConfig } from "../lib/ffmpeg.ts";
import {
  addSegment,
  deleteSegment,
  duplicateSegment,
  mergeWithNext,
  splitSegment,
} from "../lib/segment-editor.ts";
import { LocalJobQueue } from "../lib/queue/local-queue.ts";
import nextConfig from "../next.config.ts";

test("Next.js proxy accepts the 500 MB upload pipeline", () => {
  assert.equal(nextConfig.experimental?.proxyClientMaxBodySize, "500mb");
  assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, "500mb");
});

const segments: SubtitleSegment[] = [
  { id: 1, start: 0, end: 1.5, text: "Hello\nworld" },
  { id: 2, start: 1.5, end: 3, text: "Next line" },
];

test("local model resolution follows the configured precedence", () => {
  const original = {
    LOCAL_TRANSLATION_MODEL: process.env.LOCAL_TRANSLATION_MODEL,
    LOCAL_MODEL: process.env.LOCAL_MODEL,
    TRANSLATION_MODEL: process.env.TRANSLATION_MODEL,
    REWRITE_MODEL: process.env.REWRITE_MODEL,
  };

  try {
    delete process.env.LOCAL_TRANSLATION_MODEL;
    delete process.env.LOCAL_MODEL;
    delete process.env.TRANSLATION_MODEL;
    delete process.env.REWRITE_MODEL;
    assert.equal(getTranslationModel(), "qwen2.5:7b");
    assert.equal(getRewriteModel(), "qwen2.5:7b");

    process.env.TRANSLATION_MODEL = "translation-fallback";
    process.env.REWRITE_MODEL = "rewrite-fallback";
    assert.equal(getTranslationModel(), "translation-fallback");
    assert.equal(getRewriteModel(), "rewrite-fallback");

    process.env.LOCAL_MODEL = "shared-local";
    process.env.LOCAL_TRANSLATION_MODEL = "translation-local";
    assert.equal(getTranslationModel(), "translation-local");
    assert.equal(getRewriteModel(), "shared-local");
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("Ollama client reports a missing model clearly", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ data: [{ id: "another-model" }] });

  try {
    const health = await new OllamaClient({ model: "qwen2.5:7b" }).health();
    assert.equal(health.ok, false);
    assert.match(health.error ?? "", /ollama pull qwen2\.5:7b/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ollama client retries temporary chat failures", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input) => {
    calls += 1;
    const url = String(input);

    if (url.endsWith("/models")) {
      return Response.json({ data: [{ id: "qwen2.5:7b" }] });
    }

    if (calls === 2) {
      return new Response("busy", { status: 503 });
    }

    return Response.json({
      choices: [{ message: { content: '{"segments":[]}' } }],
    });
  };

  try {
    const result = await new OllamaClient({ model: "qwen2.5:7b" }).chatJSON({
      system: "test",
      user: "test",
      temperature: 0,
    });
    assert.deepEqual(result, { segments: [] });
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Ollama JSON parser accepts markdown fences and surrounding prose", () => {
  assert.deepEqual(parseOllamaJSON('```json\n{"segments":[]}\n```'), { segments: [] });
  assert.deepEqual(parseOllamaJSON('Here is the result: {"segments":[{"id":1,"text":"a } brace"}]} Done.'), {
    segments: [{ id: 1, text: "a } brace" }],
  });
});

test("Ollama translator falls back per segment and preserves order", async () => {
  const originalFetch = globalThis.fetch;
  let chatCalls = 0;
  globalThis.fetch = async (input) => {
    if (String(input).endsWith("/models")) return Response.json({ data: [{ id: "qwen2.5:7b" }] });
    chatCalls += 1;
    const responses = [
      { segments: [{ id: 99, text: "bad" }] },
      { segments: [] },
      { segments: [{ id: 1, text: "Xin chào\nthế giới" }] },
      { segments: [{ id: 999, text: "bad" }] },
      { segments: [] },
    ];
    return Response.json({ choices: [{ message: { content: JSON.stringify(responses[chatCalls - 1]) } }] });
  };
  try {
    const result = await new OllamaTranslator(new OllamaClient()).batchTranslate(
      [{ id: 1, text: "Hello\nworld" }, { id: 2, text: "Keep me" }],
      { targetLanguage: "Vietnamese" },
    );
    assert.deepEqual(result, [
      { id: 1, text: "Xin chào\nthế giới" },
      { id: 2, text: "Keep me" },
    ]);
    assert.equal(chatCalls, 5);
  } finally { globalThis.fetch = originalFetch; }
});

test("authentication is always bypassed in development only", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLegacyFlag = process.env.DEV_AUTH_BYPASS;

  try {
    mutableEnv.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "false";
    assert.equal(isDevelopmentAuthBypassEnabled(), true);

    mutableEnv.NODE_ENV = "production";
    assert.equal(isDevelopmentAuthBypassEnabled(), false);
  } finally {
    if (originalNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = originalNodeEnv;
    process.env.DEV_AUTH_BYPASS = originalLegacyFlag;
  }
});

test("translation and rewrite validation preserve ids, order, and multiline shape", () => {
  assert.equal(
    isValidTextTransform(segments, [
      { id: 1, text: "Xin chào\nthế giới" },
      { id: 2, text: "Dòng tiếp" },
    ]),
    true,
  );
  assert.equal(
    isValidTextTransform(segments, [
      { id: 2, text: "Wrong order" },
      { id: 1, text: "Wrong\norder" },
    ]),
    false,
  );
  assert.equal(
    isValidTextTransform(segments, [
      { id: 1, text: "Lost newline" },
      { id: 2, text: "Dòng tiếp" },
    ]),
    false,
  );
});

test("segment structural edits preserve stable unique ids and timing", () => {
  const source: SubtitleSegment[] = [
    { id: 4, start: 0, end: 2, text: "Hello world" },
    { id: 9, start: 4, end: 6, text: "Next" },
  ];
  const split = splitSegment(source, 4, 1);
  assert.deepEqual(split.segments.map((item) => item.id), [4, 10, 9]);
  assert.equal(split.segments[0].end, 1);
  assert.equal(split.segments[1].start, 1);

  const merged = mergeWithNext(split.segments, 4);
  assert.deepEqual(merged.segments.map((item) => item.id), [4, 9]);
  assert.equal(merged.segments[0].end, 2);

  const duplicated = duplicateSegment(source, 4);
  assert.deepEqual(duplicated.segments.map((item) => item.id), [4, 10, 9]);
  assert.equal(duplicated.segments[1].start, 2);
  assert.equal(duplicated.segments[1].end, 4);

  const added = addSegment(source, 3);
  assert.deepEqual(added.segments.map((item) => item.id), [4, 10, 9]);
  assert.equal(added.segments[1].start, 3);
  assert.equal(added.segments[1].end, 4);

  const deleted = deleteSegment(source, 4);
  assert.deepEqual(deleted.segments.map((item) => item.id), [9]);
});

test("burn SRT generation uses current edited segment state", () => {
  const original: SubtitleSegment[] = [
    { id: 1, start: 0, end: 2, text: "Original transcript" },
    { id: 2, start: 2, end: 4, text: "Delete this" },
  ];
  const edited = deleteSegment([
    { ...original[0], start: 0.25, end: 2.75, text: "EDITED BEFORE BURN" },
    original[1],
  ], 2).segments;
  const srt = buildSrt(edited);
  assert.match(srt, /00:00:00,250 --> 00:00:02,750/);
  assert.match(srt, /EDITED BEFORE BURN/);
  assert.doesNotMatch(srt, /Original transcript|Delete this/);
});

test("subtitle filter uses a Windows-safe explicit filename", () => {
  const config = createSubtitleFilterConfig(
    "C:\\Users\\PC\\AppData\\Local\\Temp\\burn-job\\subtitle.srt",
    { fontFamily: "Arial", fontSize: 42 },
  );
  assert.equal(
    config.filter,
    "subtitles=filename='subtitle.srt':force_style='FontName=Arial,FontSize=42'",
  );
  assert.doesNotMatch(config.filter, /original_size|C:|\\/);
  assert.equal(typeof config.cwd, "string");
  assert.ok(config.cwd.length > 0);
});

test("dubbing tempo filters fit long speech inside subtitle timing", () => {
  assert.deepEqual(buildTempoFilters(1), []);
  assert.deepEqual(buildTempoFilters(1.5), ["atempo=1.500000"]);
  assert.deepEqual(buildTempoFilters(5), ["atempo=2", "atempo=2", "atempo=1.250000"]);
});

test("cache keys are deterministic and namespace-aware", () => {
  assert.equal(
    createContentCacheKey("translation", "hello"),
    createContentCacheKey("translation", "hello"),
  );
  assert.notEqual(
    createContentCacheKey("translation", "hello"),
    createContentCacheKey("rewrite:natural", "hello"),
  );
});

test("exports contain valid SRT, TXT, and JSON data", () => {
  const srt = createSubtitleExport(segments, "srt");
  const txt = createSubtitleExport(segments, "txt");
  const json = JSON.parse(createSubtitleExport(segments, "json"));

  assert.match(srt, /00:00:00,000 --> 00:00:01,500/);
  assert.equal(txt, "Hello\nworld\nNext line");
  assert.deepEqual(json, segments);
});

test("VTT and ASS exports round-trip multiline subtitle timing", () => {
  for (const format of ["vtt", "ass"] as const) {
    const imported = parseSubtitleImport(createSubtitleExport(segments, format), format);
    assert.equal(imported.length, segments.length);
    assert.equal(imported[0].text, segments[0].text);
    assert.equal(imported[1].end, segments[1].end);
  }
});

test("local queue persists progress and completed jobs without a database", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cncsub-jobs-"));
  try {
    const queue = new LocalJobQueue(directory);
    queue.register("EXPORT", async ({ reportProgress }) => { await reportProgress(50); return { filename: "subtitle.srt" }; });
    const { id } = await queue.enqueue({ userId: "local", type: "EXPORT", payload: {} });
    let job = await queue.get("local", id);
    for (let index = 0; index < 30 && job?.status !== "COMPLETED"; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = await queue.get("local", id);
    }
    assert.equal(job?.status, "COMPLETED");
    assert.equal(job?.progress, 100);
    assert.equal((job?.result as { filename?: string }).filename, "subtitle.srt");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
