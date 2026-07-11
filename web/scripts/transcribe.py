import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel

sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def srt_time(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours = milliseconds // 3_600_000
    milliseconds %= 3_600_000
    minutes = milliseconds // 60_000
    milliseconds %= 60_000
    secs = milliseconds // 1000
    milliseconds %= 1000

    return f"{hours:02}:{minutes:02}:{secs:02},{milliseconds:03}"


def main():
    if len(sys.argv) < 2:
        raise ValueError("Thiếu đường dẫn video.")

    video_path = Path(sys.argv[1])

    if not video_path.exists():
        raise FileNotFoundError(f"Không tìm thấy video: {video_path}")

    model = WhisperModel(
        "small",
        device="cpu",
        compute_type="int8",
    )

    segments, info = model.transcribe(
        str(video_path),
        vad_filter=True,
        beam_size=5,
    )

    srt_parts = []
    text_parts = []

    for index, segment in enumerate(segments, start=1):
        text = segment.text.strip()

        if not text:
            continue

        text_parts.append(text)

        srt_parts.append(
            f"{index}\n"
            f"{srt_time(segment.start)} --> {srt_time(segment.end)}\n"
            f"{text}\n"
        )

    result = {
        "language": info.language,
        "language_probability": info.language_probability,
        "text": " ".join(text_parts),
        "srt": "\n".join(srt_parts),
    }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        sys.exit(1)