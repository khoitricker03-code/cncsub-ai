"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

type TranscribeResult = {
  success: boolean;
  filename: string;
  language: string;
  text: string;
  srt: string;
  error?: string;
};

export default function VideoUploader() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const downloadSrt = (filename: string, srt: string) => {
    const blob = new Blob([srt], {
      type: "application/x-subrip;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  };

  const transcribeVideo = async (file: File) => {
    setLoading(true);
    setStatus("Đang tạo phụ đề bằng AI...");

    try {
      const formData = new FormData();
      formData.append("video", file);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as TranscribeResult;

      if (!response.ok) {
        throw new Error(result.error || "Tạo phụ đề thất bại.");
      }

      setStatus(`Hoàn thành — nhận diện: ${result.language}`);
      downloadSrt(result.filename, result.srt);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Có lỗi xảy ra.";

      setStatus(`Lỗi: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];

    if (!file) return;

    setSelectedFile(file);
    setStatus(`Đã chọn: ${file.name}`);
    void transcribeVideo(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "video/*": [],
      "audio/*": [],
    },
    multiple: false,
    disabled: loading,
  });

  return (
    <div>
      <div
        {...getRootProps()}
        className="cursor-pointer rounded-xl border-2 border-dashed border-gray-600 p-12 text-center transition hover:border-blue-500"
      >
        <input {...getInputProps()} />

        {loading ? (
          <p>⏳ Đang xử lý, đừng tắt trang...</p>
        ) : isDragActive ? (
          <p>📥 Thả video vào đây...</p>
        ) : (
          <p>🎥 Kéo video vào hoặc bấm để chọn</p>
        )}
      </div>

      {selectedFile && (
        <p className="mt-3 text-sm text-gray-400">
          File: {selectedFile.name}
        </p>
      )}

      {status && (
        <p className="mt-2 text-sm text-blue-300">
          {status}
        </p>
      )}
    </div>
  );
}
