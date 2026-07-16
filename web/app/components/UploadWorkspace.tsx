"use client";

import { useRef, useState } from "react";

import VideoUploader, { type VideoUploaderHandle } from "./VideoUploader";

export default function UploadWorkspace() {
  const uploaderRef = useRef<VideoUploaderHandle>(null);
  const [hasSelectedFile, setHasSelectedFile] = useState(false);

  return (
    <>
      <VideoUploader ref={uploaderRef} onSelectionChange={setHasSelectedFile} />

      <div className="mt-8 grid grid-cols-2 gap-4">
        <select className="rounded-lg bg-gray-800 p-3">
          <option>Tiếng Việt</option>
          <option>English</option>
          <option>中文</option>
          <option>日本語</option>
          <option>한국어</option>
        </select>

        <select className="rounded-lg bg-gray-800 p-3">
          <option>Tiếng Việt</option>
          <option>English</option>
          <option>中文</option>
          <option>日本語</option>
          <option>한국어</option>
        </select>
      </div>

      <button
        type="button"
        disabled={!hasSelectedFile}
        onClick={() => uploaderRef.current?.transcribeSelected()}
        className="mt-8 w-full rounded-xl bg-blue-600 py-4 text-xl font-bold hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        🚀 Tạo phụ đề
      </button>
    </>
  );
}
