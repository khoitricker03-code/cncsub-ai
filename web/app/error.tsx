"use client";

import ErrorRecovery from "./components/ErrorRecovery";

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return <ErrorRecovery error={error} retry={unstable_retry} />;
}
