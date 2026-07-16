import assert from "node:assert/strict";
import test from "node:test";

import { isValidTextTransform } from "../lib/ai-validation.ts";
import { createContentCacheKey } from "../lib/cache-key.ts";
import { createSubtitleExport } from "../lib/export.ts";
import {
  OllamaClient,
  getRewriteModel,
  getTranslationModel,
} from "../lib/ai/ollama-client.ts";
import { isDevelopmentAuthBypassEnabled } from "../lib/services/auth-flags.ts";
import type { SubtitleSegment } from "../lib/subtitles.ts";

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
