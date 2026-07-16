import { formatSrtTime, type SubtitleSegment } from "@/lib/subtitles";

type BilingualSubtitleListProps = {
  originalSegments: SubtitleSegment[];
  translatedSegments: SubtitleSegment[];
  activeSegmentId: number | null;
  onOriginalChange: (segment: SubtitleSegment) => void;
  onTranslationChange: (segment: SubtitleSegment) => void;
  onSeek: (time: number) => void;
};

export default function BilingualSubtitleList({
  originalSegments,
  translatedSegments,
  activeSegmentId,
  onOriginalChange,
  onTranslationChange,
  onSeek,
}: BilingualSubtitleListProps) {
  const translatedById = new Map(
    translatedSegments.map((segment) => [segment.id, segment]),
  );

  return (
    <section className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
      {originalSegments.map((original, index) => {
        const translated = translatedById.get(original.id);

        return (
          <article
            key={original.id}
            data-segment-id={original.id}
            className={[
              "rounded-xl border p-4",
              original.id === activeSegmentId
                ? "border-blue-400 bg-blue-950/40"
                : "border-gray-800 bg-gray-900",
            ].join(" ")}
          >
            <button
              type="button"
              onClick={() => onSeek(original.start)}
              className="mb-3 flex w-full justify-between text-xs text-gray-400"
            >
              <span>Câu {index + 1}</span>
              <span className="font-mono">
                {formatSrtTime(original.start)} → {formatSrtTime(original.end)}
              </span>
            </button>
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="text-xs text-gray-400">
                Original
                <textarea
                  value={original.text}
                  onChange={(event) =>
                    onOriginalChange({ ...original, text: event.target.value })
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm leading-6 text-white outline-none focus:border-blue-500"
                />
              </label>
              <label className="text-xs text-gray-400">
                Translation
                <textarea
                  value={translated?.text ?? ""}
                  disabled={!translated}
                  onChange={(event) =>
                    translated &&
                    onTranslationChange({
                      ...translated,
                      text: event.target.value,
                    })
                  }
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 p-3 text-sm leading-6 text-white outline-none focus:border-purple-500 disabled:opacity-50"
                />
              </label>
            </div>
          </article>
        );
      })}
    </section>
  );
}
