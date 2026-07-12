import { REWRITE_MODES, type RewriteMode } from "@/lib/rewrite";

type RewriteToolbarProps = {
  mode: RewriteMode;
  progress: number;
  isRewriting: boolean;
  error: string;
  onModeChange: (mode: RewriteMode) => void;
  onRewriteAll: () => void;
  onCancel: () => void;
};

export default function RewriteToolbar({
  mode,
  progress,
  isRewriting,
  error,
  onModeChange,
  onRewriteAll,
  onCancel,
}: RewriteToolbarProps) {
  return (
    <section className="space-y-3 rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">AI Rewrite</span>
        <select
          value={mode}
          disabled={isRewriting}
          onChange={(event) => onModeChange(event.target.value as RewriteMode)}
          className="ml-auto rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 capitalize text-white"
        >
          {REWRITE_MODES.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={isRewriting ? onCancel : onRewriteAll}
          className={[
            "rounded-lg px-4 py-2 font-semibold",
            isRewriting
              ? "bg-red-600 hover:bg-red-700"
              : "bg-cyan-600 hover:bg-cyan-700",
          ].join(" ")}
        >
          {isRewriting ? "Hủy rewrite" : "Rewrite tất cả"}
        </button>
      </div>
      {isRewriting && (
        <div className="h-2 overflow-hidden rounded-full bg-gray-800">
          <div className="h-full bg-cyan-500 transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-red-300">{error}</p>}
    </section>
  );
}
