"use client";

import { useRef, useState } from "react";

import VideoUploader, { type VideoUploaderHandle } from "./VideoUploader";
import { TRANSLATION_LANGUAGES } from "@/lib/translation/languages";
import { REWRITE_MODES } from "@/lib/rewrite";

export default function UploadWorkspace() {
  const uploaderRef = useRef<VideoUploaderHandle>(null);
  const [hasSelectedFile, setHasSelectedFile] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("vi");
  const [rewriteEnabled, setRewriteEnabled] = useState(false);
  const [rewriteMode, setRewriteMode] = useState("natural");

  const generateSubtitles = () => {
    void uploaderRef.current?.generateSubtitles({
      sourceLanguage,
      targetLanguage,
      provider: "local",
      rewriteMode: rewriteEnabled ? rewriteMode : undefined,
    });
  };

  return (
    <div className="space-y-8">
      <VideoUploader
        ref={uploaderRef}
        onSelectionChange={setHasSelectedFile}
        onBusyChange={setIsWorking}
      />

      <section className="rounded-2xl border border-gray-800 bg-gray-950/60 p-5">
        <div className="mb-5">
          <h2 className="text-xl font-bold">Tạo phụ đề đã dịch</h2>
          <p className="mt-1 text-sm text-gray-400">
            Chọn video và ngôn ngữ. Một lần bấm sẽ chạy Whisper, dịch bằng
            Ollama và mở trình chỉnh sửa.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-semibold text-gray-200">Ngôn ngữ gốc</span>
            <select
              aria-label="Ngôn ngữ gốc"
              value={sourceLanguage}
              onChange={(event) => setSourceLanguage(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3"
              disabled={isWorking}
            >
              <option value="auto">Tự nhận diện</option>
              {TRANSLATION_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm">
            <span className="font-semibold text-gray-200">Dịch sang</span>
            <select
              aria-label="Ngôn ngữ đích"
              value={targetLanguage}
              onChange={(event) => setTargetLanguage(event.target.value)}
              className="w-full rounded-lg border border-gray-700 bg-gray-800 p-3"
              disabled={isWorking}
            >
              {TRANSLATION_LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900 p-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={rewriteEnabled}
              onChange={(event) => setRewriteEnabled(event.target.checked)}
              disabled={isWorking}
            />
            <span className="font-semibold">Viết lại câu tự nhiên hơn bằng Ollama</span>
          </label>

          {rewriteEnabled ? (
            <select
              aria-label="Kiểu viết lại"
              value={rewriteMode}
              onChange={(event) => setRewriteMode(event.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-700 bg-gray-800 p-3"
              disabled={isWorking}
            >
              {REWRITE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        <div className="mt-4 rounded-xl border border-blue-900/60 bg-blue-950/30 p-4 text-sm text-blue-200">
          Chạy hoàn toàn trên máy: Whisper + Ollama qwen2.5:7b. Không dùng
          Gemini hoặc OpenAI.
        </div>

        <button
          type="button"
          disabled={!hasSelectedFile || isWorking}
          onClick={generateSubtitles}
          className="mt-5 w-full rounded-xl bg-blue-600 py-4 text-xl font-bold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isWorking ? "Đang xử lý..." : "🚀 Tạo phụ đề đã dịch"}
        </button>

        {!hasSelectedFile ? (
          <p className="mt-3 text-center text-sm text-gray-500">
            Chọn video trước để bật nút tạo phụ đề.
          </p>
        ) : null}
      </section>
    </div>
  );
}
