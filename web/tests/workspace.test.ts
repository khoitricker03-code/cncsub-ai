import assert from "node:assert/strict";
import test from "node:test";

import { isValidTextTransform } from "../lib/ai-validation.ts";
import { createContentCacheKey } from "../lib/cache-key.ts";
import { createSubtitleExport } from "../lib/export.ts";
import { isDevelopmentAuthBypassEnabled } from "../lib/services/auth-flags.ts";
import type { SubtitleSegment } from "../lib/subtitles.ts";

const segments: SubtitleSegment[] = [
  { id: 1, start: 0, end: 1.5, text: "Hello\nworld" },
  { id: 2, start: 1.5, end: 3, text: "Next line" },
];

test("authentication is always bypassed in development only", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLegacyFlag = process.env.DEV_AUTH_BYPASS;

  try {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_BYPASS = "false";
    assert.equal(isDevelopmentAuthBypassEnabled(), true);

    process.env.NODE_ENV = "production";
    assert.equal(isDevelopmentAuthBypassEnabled(), false);
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
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
