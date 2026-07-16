"use client";

import ErrorRecovery from "./components/ErrorRecovery";

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="vi">
      <body>
        <title>CNCSub AI gặp sự cố</title>
        <ErrorRecovery error={error} retry={unstable_retry} global />
      </body>
    </html>
  );
}
