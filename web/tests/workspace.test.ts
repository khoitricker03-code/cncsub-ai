import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isValidTextTransform } from "../lib/ai-validation.ts";
import { createContentCacheKey } from "../lib/cache-key.ts";
import { createSubtitleExport, parseSubtitleImport } from "../lib/export.ts";
import {
  OllamaClient,
  getRewriteModel,
  getTranslationModel,
} from "../lib/ai/ollama-client.ts";
import { isDevelopmentAuthBypassEnabled } from "../lib/services/auth-flags.ts";
import type { SubtitleSegment } from "../lib/subtitles.ts";
import {
  addSegment,
  deleteSegment,
  duplicateSegment,
  mergeWithNext,
  splitSegment,
} from "../lib/segment-editor.ts";
import { LocalJobQueue } from "../lib/queue/local-queue.ts";
import { getPythonExecutable } from "../lib/python.ts";
import nextConfig from "../next.config.ts";
import { buildSubtitleFilter } from "../lib/ffmpeg.ts";
import {
  buildSeparatedAudioMixFilter,
  buildVoiceOnlyMixFilter,
  buildVoiceTimelineFilter,
} from "../lib/dub-audio.ts";
import {
  buildDemucsArgs,
  findDemucsPython,
  getDemucsFailure,
  getDemucsModelCachePaths,
  getDemucsOutputPaths,
  isCudaInitializationFailure,
  isSeparationManifest,
  parseDemucsProgress,
  selectDemucsDevice,
} from "../lib/demucs.ts";
import {
  getDefaultEdgeVoice,
  parseDubbingOptions,
} from "../lib/tts-config.ts";
import { findEdgeTtsPython } from "../lib/tts.ts";

test("Next.js proxy accepts the 500 MB upload pipeline", () => {
  assert.equal(nextConfig.experimental?.proxyClientMaxBodySize, "500mb");
  assert.equal(nextConfig.experimental?.serverActions?.bodySizeLimit, "500mb");
});

test("subtitle filters avoid Windows drive-letter parsing by using only the filename", () => {
  const filter = buildSubtitleFilter("C:\\Users\\PC\\Dub Jobs\\translated.srt");
  assert.equal(filter, "subtitles=filename='translated.srt'");
});

test("Python subprocesses resolve only PYTHON_PATH or python", async () => {
  const configured = "E:\\cncsub-ai-env\\Scripts\\python.exe";
  const originalPythonPath = process.env.PYTHON_PATH;
  try {
    process.env.PYTHON_PATH = configured;
    assert.equal(getPythonExecutable(), configured);
    delete process.env.PYTHON_PATH;
    assert.equal(getPythonExecutable(), "python");
  } finally {
    if (originalPythonPath === undefined) delete process.env.PYTHON_PATH;
    else process.env.PYTHON_PATH = originalPythonPath;
  }

  const [whisper, demucs, tts] = await Promise.all([
    readFile(new URL("../lib/whisper.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/demucs.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/tts.ts", import.meta.url), "utf8"),
  ]);
  const sources = [whisper, demucs, tts].join("\n");
  const retiredSetting = ["PYTHON", "BIN"].join("_");
  assert.doesNotMatch(sources, new RegExp(`${retiredSetting}|command:\\s*["']python3["']|command:\\s*["']py["']`));
  assert.match(whisper, /getPythonExecutable\(\)/);
  assert.match(demucs, /logPythonExecutable\("demucs"/);
  assert.match(tts, /logPythonExecutable\("tts"/);
});

test("AI Dubbing delegates subtitle rendering to the shared burn pipeline", async () => {
  const route = await readFile(new URL("../app/api/dub/route.ts", import.meta.url), "utf8");
  assert.match(route, /await burnSubtitle\(\{/);
  assert.match(route, /separationCacheDir:\s*path\.join\(root, "separation"\)/);
  assert.doesNotMatch(route, /subtitles\s*=/);
  assert.doesNotMatch(route, /spawn\(["']ffmpeg["']/);
});

test("shared subtitle rendering runs FFmpeg from the subtitle directory", async () => {
  const source = await readFile(new URL("../lib/ffmpeg.ts", import.meta.url), "utf8");
  assert.match(source, /const subtitleDir = path\.dirname\(path\.resolve\(options\.subtitleFile\)\)/);
  assert.match(source, /cwd: subtitleDir/);
  assert.doesNotMatch(source, /replace\(\/:\/g, "\\\\:"\)/);
});

test("AI Dubbing selects sensible Edge voices by translated language", () => {
  assert.equal(getDefaultEdgeVoice("vi"), "vi-VN-HoaiMyNeural");
  assert.equal(getDefaultEdgeVoice("en-US"), "en-US-JennyNeural");
  assert.equal(getDefaultEdgeVoice("zh"), "zh-CN-XiaoxiaoNeural");
  assert.equal(getDefaultEdgeVoice("ja"), "ja-JP-NanamiNeural");
  assert.equal(getDefaultEdgeVoice("ko"), "ko-KR-SunHiNeural");
});

test("AI Dubbing accepts only the Edge TTS provider", () => {
  const options = parseDubbingOptions({ provider: "edge", language: "vi" });
  assert.equal(options.provider, "edge");
  assert.equal(options.mode, "replace-vocals");
  assert.equal(options.voiceVolume, 1);
  assert.equal(options.backgroundVolume, 1);
  assert.throws(
    () => parseDubbingOptions({ provider: "kokoro", language: "vi" }),
    /supports only edge/i,
  );
  assert.throws(() => parseDubbingOptions({ mode: "invalid" }), /replace-vocals or replace-all/i);
  assert.throws(() => parseDubbingOptions({ voiceVolume: 2.1 }), /voiceVolume/i);
  assert.throws(() => parseDubbingOptions({ backgroundVolume: -0.1 }), /backgroundVolume/i);
});

test("voice timeline preserves gaps with per-segment adelay filters", () => {
  const filter = buildVoiceTimelineFilter([
    { id: 7, start: 1.25, end: 2.25, duration: 1.5 },
    { id: 9, start: 4, end: 5, duration: 0.8 },
  ], 6);
  assert.match(filter, /adelay=1250:all=1/);
  assert.match(filter, /adelay=4000:all=1/);
  assert.match(filter, /atempo=1\.5/);
  assert.match(filter, /aevalsrc=0:d=6:s=48000:c=stereo\[timeline\]/);
  assert.match(filter, /amix=inputs=3/);
  assert.match(filter, /atrim=end=6/);
});

test("AI Dubbing mixes the preserved background and timed voice at independent volumes", () => {
  const filter = buildSeparatedAudioMixFilter(0.75, 1.25, 8);
  assert.match(filter, /\[0:a\].*volume=0\.75\[background\]/);
  assert.match(filter, /\[1:a\].*volume=1\.25\[ai\]/);
  assert.match(filter, /\[background\]\[ai\]amix=inputs=2/);
  assert.match(filter, /alimiter=limit=0\.95/);
  assert.match(filter, /atrim=end=8\[mixed\]/);
});

test("Replace Entire Audio fallback uses only the AI voice input", () => {
  const filter = buildVoiceOnlyMixFilter(1, 8);
  assert.match(filter, /^\[0:a\]/);
  assert.doesNotMatch(filter, /\[1:a\]|background/);
  assert.match(filter, /volume=1/);
});

test("Demucs runs two-stem vocal separation and locates both output stems", () => {
  const args = buildDemucsArgs(
    "C:\\source audio.wav",
    "C:\\project\\separation-work",
    "htdemucs",
    "cuda",
  );
  assert.deepEqual(args.slice(0, 9), [
    "-m", "demucs", "--two-stems", "vocals", "--name", "htdemucs", "--device", "cuda", "--out",
  ]);
  assert.equal(args.at(-1), "C:\\source audio.wav");

  const output = getDemucsOutputPaths("out", "htdemucs", "source.wav");
  assert.equal(output.vocalsPath, path.join("out", "htdemucs", "source", "vocals.wav"));
  assert.equal(output.accompanimentPath, path.join("out", "htdemucs", "source", "no_vocals.wav"));
});

test("Demucs selects CUDA when PyTorch can initialize the GPU", () => {
  const selection = selectDemucsDevice({
    torchVersion: "2.6.0+cu124",
    torchCudaVersion: "12.4",
    cudaAvailable: true,
    cudaDeviceCount: 1,
    cudaDeviceName: "NVIDIA GeForce RTX 2060",
    cudaInitializationError: null,
  });
  assert.equal(selection.selectedDevice, "cuda");
  assert.equal(selection.reason, null);
});

test("Demucs reports a CPU-only PyTorch build as the exact reason CUDA is unavailable", () => {
  const selection = selectDemucsDevice({
    torchVersion: "2.13.0+cpu",
    torchCudaVersion: null,
    cudaAvailable: false,
    cudaDeviceCount: 0,
    cudaDeviceName: null,
    cudaInitializationError: null,
  });
  assert.equal(selection.selectedDevice, "cpu");
  assert.match(selection.reason ?? "", /PyTorch 2\.13\.0\+cpu is a CPU-only build/);
  assert.match(selection.reason ?? "", /torch\.cuda\.is_available\(\) is false/);
});

test("Demucs falls back to CPU only for a CUDA initialization failure", () => {
  const selection = selectDemucsDevice({
    torchVersion: "2.6.0+cu124",
    torchCudaVersion: "12.4",
    cudaAvailable: true,
    cudaDeviceCount: 1,
    cudaDeviceName: "NVIDIA GeForce RTX 2060",
    cudaInitializationError: "RuntimeError: CUDA driver initialization failed",
  });
  assert.equal(selection.selectedDevice, "cpu");
  assert.match(selection.reason ?? "", /CUDA initialization failed.*driver initialization failed/);

  assert.equal(isCudaInitializationFailure({
    code: 1,
    stdout: "",
    stderr: "RuntimeError: CUDA error: initialization error",
  }), true);
  assert.equal(isCudaInitializationFailure({
    code: 1,
    stdout: "",
    stderr: "ConnectionError: model download failed",
  }), false);
  assert.equal(isCudaInitializationFailure({
    code: 1,
    stdout: "",
    stderr: "torch.OutOfMemoryError: CUDA out of memory",
  }), false);
});

test("separated-audio cache is invalidated when the source or model changes", () => {
  const manifest = {
    version: 1,
    sourceSha256: "source-a",
    model: "htdemucs",
    vocalsFile: "vocals.wav",
    accompanimentFile: "accompaniment.wav",
    createdAt: "2026-07-17T00:00:00.000Z",
  };
  assert.equal(isSeparationManifest(manifest, "source-a", "htdemucs"), true);
  assert.equal(isSeparationManifest(manifest, "source-b", "htdemucs"), false);
  assert.equal(isSeparationManifest(manifest, "source-a", "htdemucs_ft"), false);
});

test("the Hugging Face authentication warning is non-fatal when Demucs succeeds", () => {
  assert.equal(getDemucsFailure({
    code: 0,
    stdout: "Separated tracks will be stored in output",
    stderr: "Warning: You are sending unauthenticated requests to the HF Hub.",
  }), null);
});

test("Demucs failures include the exit code and output after non-fatal warnings", () => {
  const failure = getDemucsFailure({
    code: 1,
    stdout: "Traceback (most recent call last):\nPermissionError: [WinError 5] Access is denied",
    stderr: "Warning: You are sending unauthenticated requests to the HF Hub.",
  });
  assert.match(failure ?? "", /exited with code 1/i);
  assert.match(failure ?? "", /model cache or output directory is not writable/i);
  assert.match(failure ?? "", /PermissionError: \[WinError 5\] Access is denied/);
  assert.match(failure ?? "", /Non-fatal warning ignored/i);
});

test("Demucs reports model download and separation progress separately", () => {
  assert.deepEqual(
    parseDemucsProgress('Downloading: "https://example.test/model.th" to cache'),
    { kind: "download", percent: 0, phase: "Downloading Demucs model" },
  );
  assert.deepEqual(
    parseDemucsProgress(" 42%|####| 42.0MiB/100MiB [00:02<00:03, 20MiB/s]"),
    { kind: "download", percent: 42, phase: "Downloading Demucs model (42%)" },
  );
  assert.deepEqual(
    parseDemucsProgress(" 67%|####| 23.4/35.1 [00:11<00:05, 2.12seconds/s]"),
    { kind: "separation", percent: 67, phase: "Separating vocals and background (67%)" },
  );
});

test("Demucs model downloads use a persistent configurable application cache", () => {
  const cache = getDemucsModelCachePaths(path.join("CNCSubAI", "demucs-models"));
  assert.equal(cache.root, path.resolve(path.join("CNCSubAI", "demucs-models")));
  assert.equal(cache.torchHome, path.join(cache.root, "torch"));
  assert.equal(cache.huggingFaceHome, path.join(cache.root, "huggingface"));
});

test("missing Demucs reports the installation command", async () => {
  await assert.rejects(
    () => findDemucsPython(
      async () => "module-missing",
      [{ command: "python", prefixArgs: [], displayName: "python" }],
    ),
    /python -m pip install demucs/i,
  );
});

test("AI Dubbing exposes an explicit Demucs fallback without silently changing modes", async () => {
  const panel = await readFile(new URL("../app/components/AIDubbing.tsx", import.meta.url), "utf8");
  assert.match(panel, /Replace Voice Only is disabled/);
  assert.match(panel, /Replace Entire Audio/);
  assert.match(panel, /disabled=\{demucsStatus !== "available"\}/);
  assert.match(panel, /aria-label="AI voice volume"/);
  assert.match(panel, /aria-label="Background volume"/);
});

test("AI Dubbing downloads the rendered MP4 through a temporary Blob URL", async () => {
  const panel = await readFile(new URL("../app/components/AIDubbing.tsx", import.meta.url), "utf8");
  const handler = panel.match(/const download = async \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(handler);
  assert.match(handler[0], /video\?rendered=true/);
  assert.match(handler[0], /Range: "bytes=0-"/);
  assert.match(handler[0], /await response\.blob\(\)/);
  assert.match(handler[0], /URL\.createObjectURL\(blob\)/);
  assert.match(handler[0], /link\.download = "dubbed\.mp4"/);
  assert.match(handler[0], /link\.click\(\)/);
  assert.match(handler[0], /URL\.revokeObjectURL\(url\)/);
  assert.match(handler[0], /await response\.text\(\)/);
  assert.doesNotMatch(handler[0], /response\.json\(\)/);
});

test("missing Edge TTS reports the installation command", async () => {
  await assert.rejects(
    () => findEdgeTtsPython(
      async () => "module-missing",
      [{ command: "python", prefixArgs: [], displayName: "python" }],
    ),
    /pip install edge-tts/i,
  );
});

test("AI Dubbing contains no silent FFmpeg TTS placeholder", async () => {
  const source = await readFile(new URL("../lib/tts.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, new RegExp(["anull", "src"].join(""), "i"));
  assert.match(source, /"-m",\s*\n\s*"edge_tts"/);
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

test("Ollama client preserves the real error after an HTTP 500", async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const originalError = console.error;
  const logs: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.endsWith("/models")) {
      return Response.json({ data: [{ id: "qwen2.5:7b" }] });
    }

    return Response.json(
      { error: "model runner process exited: GPU memory exhausted" },
      { status: 500 },
    );
  };
  console.info = (output?: unknown) => {
    logs.push(String(output));
  };
  console.error = (output?: unknown) => {
    logs.push(String(output));
  };

  try {
    await assert.rejects(
      () =>
        new OllamaClient({
          model: "qwen2.5:7b",
          retryDelaysMs: [],
        }).chatJSON({
          system: "test",
          user: "test",
          temperature: 0,
          diagnostics: "translation",
        }),
      (error: unknown) => {
        assert.match(
          String(error),
          /HTTP 500: model runner process exited: GPU memory exhausted/,
        );
        assert.doesNotMatch(String(error), /Không kết nối được Ollama/);
        return true;
      },
    );

    const records = logs.map((entry) => JSON.parse(entry) as Record<string, unknown>);
    const response = records.find(
      (entry) => entry.event === "ollama.translation.response",
    );
    const exception = records.find(
      (entry) => entry.event === "ollama.translation.exception",
    );

    assert.equal(response?.status, 500);
    assert.match(String(response?.body), /GPU memory exhausted/);
    assert.match(String(exception?.stack), /OllamaHttpError/);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
    console.error = originalError;
  }
});

test("translation diagnostics log the exact Ollama request without secrets", async () => {
  const originalFetch = globalThis.fetch;
  const originalInfo = console.info;
  const logs: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);

    if (url.endsWith("/models")) {
      return Response.json({ data: [{ id: "qwen2.5:7b" }] });
    }

    return Response.json({
      choices: [{ message: { content: '{"segments":[]}' } }],
    });
  };
  console.info = (output?: unknown) => {
    logs.push(String(output));
  };

  try {
    await new OllamaClient({
      apiKey: "must-not-appear-in-logs",
      model: "qwen2.5:7b",
    }).chatJSON({
      system: "return JSON",
      user: "translate this",
      temperature: 0,
      diagnostics: "translation",
    });

    const records = logs.map((entry) => JSON.parse(entry) as Record<string, unknown>);
    const request = records.find(
      (entry) => entry.event === "ollama.translation.request",
    );
    const response = records.find(
      (entry) => entry.event === "ollama.translation.response",
    );

    assert.equal(request?.url, "http://127.0.0.1:11434/v1/chat/completions");
    assert.deepEqual(request?.headers, {
      Authorization: "[redacted]",
      "Content-Type": "application/json",
    });
    assert.deepEqual(request?.body, {
      model: "qwen2.5:7b",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "return JSON" },
        { role: "user", content: "translate this" },
      ],
    });
    assert.equal(response?.status, 200);
    assert.match(String(response?.body), /segments/);
    assert.doesNotMatch(logs.join("\n"), /must-not-appear-in-logs/);
  } finally {
    globalThis.fetch = originalFetch;
    console.info = originalInfo;
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
