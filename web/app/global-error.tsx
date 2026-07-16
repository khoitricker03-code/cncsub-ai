"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="vi"><body className="min-h-screen bg-gray-950 p-8 text-gray-100">
      <main className="mx-auto max-w-lg rounded-xl border border-red-900 bg-gray-900 p-6">
        <h1 className="text-xl font-bold">CNCSub gặp lỗi</h1>
        <p className="mt-2 text-sm text-gray-300">{error.message || "Không thể tải workspace."}</p>
        {error.digest ? <p className="mt-2 text-xs text-gray-500">Mã lỗi: {error.digest}</p> : null}
        <button type="button" onClick={reset} className="mt-5 rounded-lg bg-blue-600 px-4 py-2 font-semibold">Thử lại</button>
      </main>
    </body></html>
  );
}
