"use client";

import { useRef, useState } from "react";

import VideoUploader, { type VideoUploaderHandle } from "./VideoUploader";
import { TRANSLATION_LANGUAGES } from "@/lib/translation/languages";

export default function UploadWorkspace() {
  const uploaderRef = useRef<VideoUploaderHandle>(null);
  const [hasSelectedFile, setHasSelectedFile] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [sourceLanguage, setSourceLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("en");

  return (
    <>
      <VideoUploader ref={uploaderRef} onSelectionChange={setHasSelectedFile} onBusyChange={setIsWorking} />

      <div className="mt-8 grid grid-cols-2 gap-4">
        <select aria-label="Source language" value={sourceLanguage} onChange={(event) => setSourceLanguage(event.target.value)} className="rounded-lg bg-gray-800 p-3">
          <option value="auto">Auto detect</option>
          {TRANSLATION_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>

        <select aria-label="Target language" value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} className="rounded-lg bg-gray-800 p-3">
          {TRANSLATION_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>
      </div>

      <button
        type="button"
        disabled={!hasSelectedFile || isWorking}
        onClick={() => void uploaderRef.current?.translateSelected(sourceLanguage, targetLanguage)}
        className="mt-8 w-full rounded-xl bg-blue-600 py-4 text-xl font-bold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isWorking ? "Đang xử lý..." : "🚀 Tạo phụ đề"}
      </button>
    </>
  );
}
