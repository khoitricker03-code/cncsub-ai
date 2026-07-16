"use client";

import { useRef, useState } from "react";

import VideoUploader, { type VideoUploaderHandle } from "./VideoUploader";
import { REWRITE_MODES, type RewriteMode } from "@/lib/rewrite";
import { TRANSLATION_LANGUAGES } from "@/lib/translation/languages";

export default function UploadWorkspace() {
  const uploaderRef = useRef<VideoUploaderHandle>(null);
  const [hasSelectedFile, setHasSelectedFile] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("vi");
  const [rewriteEnabled, setRewriteEnabled] = useState(false);
  const [rewriteMode, setRewriteMode] = useState<RewriteMode>("natural");

  return (
    <div className="space-y-8">
      <VideoUploader
        ref={uploaderRef}
        onSelectionChange={setHasSelectedFile}
        onBusyChange={setIsWorking}
      />

      <section className="rounded-2xl border border-gray-800 bg-gray-950/60 p-5">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Thiết lập phụ đề</h2>
          <p className="mt-1 text-sm text-gray-400">
            Một lần bấm sẽ chạy Whisper → dịch bằng Ollama → rewrite tùy chọn → mở editor.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-gray-300">
            <span>Ngôn ngữ gốc</span>
            <select
              value={sourceLanguage}
              onChange={(event) => setSourceLanguage(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white"
            >
              <option value="auto">Tự động nhận diện</option>
              {TRANSLATION_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm text-gray-300">
            <span>Ngôn ngữ muốn dịch</span>
            <select
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-900 p-3 text-white"
            >
              {TRANSLATION_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm">
            <p className="font-medium text-white">AI dịch</p>
            <p className="mt-1 text-gray-400">Local Ollama · qwen2.5:7b · miễn phí</p>
          </div>

          <div className="flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-900 p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={rewriteEnabled}
                onChange={(event) => setRewriteEnabled(event.target.checked)}
              />
              AI Rewrite
            </label>
            <select
              aria-label="Chế độ rewrite"
              disabled={!rewriteEnabled}
              value={rewriteMode}
              onChange={(event) => setRewriteMode(event.target.value as RewriteMode)}
              className="ml-auto rounded bg-gray-950 p-2 text-sm disabled:opacity-40"
            >
              {REWRITE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={!hasSelectedFile || isWorking}
          onClick={() =>
            void uploaderRef.current?.generateSubtitles({
              sourceLanguage,
              targetLanguage,
              rewriteMode: rewriteEnabled ? rewriteMode : undefined,
            })
          }
          className="mt-6 w-full rounded-xl bg-blue-600 py-4 text-lg font-bold transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isWorking ? "Đang chạy pipeline..." : "🚀 Tạo phụ đề đã dịch"}
        </button>
      </section>
    </div>
  );
}
