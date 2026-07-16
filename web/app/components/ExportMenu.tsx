import {
  createSubtitleExport,
  downloadSubtitleExport,
  type SubtitleExportFormat,
  parseSubtitleImport,
} from "@/lib/export";
import type { SubtitleSegment } from "@/lib/subtitles";

type ExportMenuProps = {
  originalSegments: SubtitleSegment[];
  translatedSegments: SubtitleSegment[];
  onImport?: (segments: SubtitleSegment[]) => void;
};

const FORMATS: Array<{ format: SubtitleExportFormat; label: string }> = [
  { format: "srt", label: "SRT" },
  { format: "vtt", label: "VTT" },
  { format: "ass", label: "ASS" },
  { format: "txt", label: "TXT" },
  { format: "json", label: "JSON" },
];

export default function ExportMenu({
  originalSegments,
  translatedSegments,
  onImport,
}: ExportMenuProps) {
  const exportTrack = (
    track: "original" | "translated",
    segments: SubtitleSegment[],
    format: SubtitleExportFormat,
  ) => {
    const extension = format;
    const mime = format === "json" ? "application/json" : "text/plain";
    downloadSubtitleExport(
      `${track}.${extension}`,
      createSubtitleExport(segments, format),
      mime,
    );
  };

  return (
    <section className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 font-semibold">Export</span>
        {FORMATS.map(({ format, label }) => (
          <button
            key={`original-${format}`}
            type="button"
            onClick={() => exportTrack("original", originalSegments, format)}
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm font-semibold hover:bg-gray-600"
          >
            Original {label}
          </button>
        ))}
        {FORMATS.filter(({ format }) => format !== "json").map(
          ({ format, label }) => (
            <button
              key={`translated-${format}`}
              type="button"
              disabled={translatedSegments.length === 0}
              onClick={() =>
                exportTrack("translated", translatedSegments, format)
              }
              className="rounded-lg bg-purple-700 px-3 py-2 text-sm font-semibold hover:bg-purple-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Translated {label}
            </button>
          ),
        )}
      </div>
      {onImport ? (
        <label className="mt-3 inline-flex cursor-pointer rounded-lg bg-gray-700 px-3 py-2 text-sm font-semibold hover:bg-gray-600">
          Import SRT / VTT / ASS / TXT / JSON
          <input
            type="file"
            accept=".srt,.vtt,.ass,.txt,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const format = file.name.split(".").pop()?.toLowerCase() as SubtitleExportFormat;
              void file.text().then((content) => onImport(parseSubtitleImport(content, format))).catch((error: unknown) => alert(error instanceof Error ? error.message : "Import failed."));
              event.target.value = "";
            }}
          />
        </label>
      ) : null}
    </section>
  );
}
