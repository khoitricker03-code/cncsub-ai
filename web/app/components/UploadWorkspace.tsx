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
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [provider, setProvider] = useState("local");
  const [rewriteEnabled, setRewriteEnabled] = useState(false);
  const [rewriteMode, setRewriteMode] = useState("natural");

  return (
    <>
      <VideoUploader ref={uploaderRef} onSelectionChange={setHasSelectedFile} onBusyChange={setIsWorking} />

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <select aria-label="Source language" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} className="rounded-lg bg-gray-800 p-3">
          <option value="auto">Auto detect</option>
          {TRANSLATION_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>

        <select aria-label="Translation provider" value={provider} onChange={(event) => setProvider(event.target.value)} className="rounded-lg bg-gray-800 p-3">
          <option value="local">Local Ollama (Offline)</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
        </select>

        <div className="flex items-center gap-3 rounded-lg bg-gray-800 p-3">
          <label className="flex items-center gap-2"><input type="checkbox" checked={rewriteEnabled} onChange={(event) => setRewriteEnabled(event.target.checked)} /> Optional AI Rewrite</label>
          <select aria-label="Rewrite mode" disabled={!rewriteEnabled} value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)} className="ml-auto rounded bg-gray-900 p-2 disabled:opacity-40">
            {REWRITE_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
          </select>
        </div>

        <select aria-label="Target language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} className="rounded-lg bg-gray-800 p-3">
          {TRANSLATION_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>
      </div>

      <button
        type="button"
        disabled={!hasSelectedFile || isWorking}
        onClick={() => void uploaderRef.current?.generateSubtitles({ sourceLanguage, targetLanguage, provider, rewriteMode: rewriteEnabled ? rewriteMode : undefined })}
        className="mt-8 w-full rounded-xl bg-blue-600 py-4 text-xl font-bold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isWorking ? "Đang chạy pipeline..." : "🚀 Generate Subtitle"}
      </button>
    </>
  );
}
