# CNCSub AI workflow update

Implemented a single local-first workflow:

1. Select a video or audio file.
2. Select source and target languages.
3. Optionally enable Ollama rewrite.
4. Click **Tạo phụ đề đã dịch**.
5. The app runs Whisper, Ollama translation, optional rewrite, persists the translated track, and opens the project editor.
6. The project editor can burn the currently active subtitle track, including all text/timing edits.

Verification completed in the provided source snapshot:

- `npm run lint` passed.
- `npm test` passed: 11/11 tests.
- Full typecheck/build could not be completed in the isolated environment because Prisma client generation requires downloading its native engine from `binaries.prisma.sh`, which is unavailable without network access.

Local requirements:

- Ollama running with `qwen2.5:7b`.
- FFmpeg and FFprobe in PATH.
- Python/Faster-Whisper dependencies installed.
