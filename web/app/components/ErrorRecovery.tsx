"use client";

import { useEffect } from "react";
import Link from "next/link";

type ErrorRecoveryProps = {
  error: Error & { digest?: string };
  retry: () => void;
  global?: boolean;
};

export default function ErrorRecovery({
  error,
  retry,
  global = false,
}: ErrorRecoveryProps) {
  useEffect(() => {
    console.error("CNCSub AI render failure", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-950 p-6 text-white">
      <section
        className="w-full max-w-xl rounded-2xl border border-red-900/70 bg-gray-900 p-8 shadow-2xl"
        role="alert"
      >
        <p className="text-sm font-semibold uppercase tracking-wider text-red-400">
          {global ? "Application error" : "Workspace error"}
        </p>
        <h1 className="mt-3 text-3xl font-bold">CNCSub AI gặp sự cố</h1>
        <p className="mt-3 text-gray-300">
          Dữ liệu project đã lưu vẫn an toàn. Hãy thử tải lại phần làm việc này.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-gray-500">
            Mã lỗi: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-blue-600 px-5 py-3 font-semibold hover:bg-blue-700"
          >
            Thử lại
          </button>
          <Link
            href="/"
            className="rounded-lg bg-gray-700 px-5 py-3 font-semibold hover:bg-gray-600"
          >
            Về Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
