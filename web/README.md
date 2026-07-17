# CNCSub AI — local-first subtitle workspace

CNCSub AI is a Next.js subtitle workspace that transcribes with Faster-Whisper, translates and rewrites with a local Ollama model, burns subtitles with FFmpeg, and creates dubbed speech with Edge TTS. AI Dubbing v2 uses Demucs to preserve music, ambience, and sound effects while replacing dialogue. The default development workflow is single-user and login-free. Transcription, translation, editing, and rendering are local; Edge speech and the first Demucs model download need internet access.

## Windows setup

Install Node.js 20+, Python 3.10+, Git, [FFmpeg](https://www.gyan.dev/ffmpeg/builds/), and [Ollama](https://ollama.com/download/windows). Ensure `node`, `npm`, `python`, `ffmpeg`, `ffprobe`, and `ollama` are available in a new PowerShell window. Install Edge TTS and Demucs into the same Python interpreter CNCSub AI will use:

```powershell
python -m pip install edge-tts demucs
python -m edge_tts --version
python -m demucs --help
```

Linux users can use `python3 -m pip install edge-tts demucs`. CNCSub AI detects `python`, `python3`, and the Windows `py -3` launcher. Set `PYTHON_BIN` in `.env.local` to an absolute Python executable when none of those commands resolve to the desired interpreter. Demucs downloads its configured model on the first separation; CPU separation works but can be substantially slower than a supported GPU.

```powershell
ollama pull qwen2.5:7b
ollama list
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000. Ollama must remain running. Use http://localhost:3000/api/health to diagnose Ollama, the configured model, FFmpeg, FFprobe, Python, Edge TTS, and optional Demucs availability. If Edge TTS or Demucs is missing, install it for the detected interpreter and restart the app. If Demucs is unavailable, Replace Voice Only is disabled and the panel explicitly offers Replace Entire Audio. If the Ollama model is missing, run `ollama pull qwen2.5:7b`. If Ollama is offline, start it from the Windows application or run `ollama serve`.

Faster-Whisper is invoked by `scripts/transcribe.py`. Install its Python dependencies in the interpreter used by the app if they are not already available. Transcription and generated media stay below `storage/`, which is intentionally ignored by Git.

## Configuration

Copy `.env.example` to `.env.local`. The supported local defaults are:

- `LOCAL_BASE_URL=http://127.0.0.1:11434/v1`
- `LOCAL_TRANSLATION_MODEL=qwen2.5:7b`
- `LOCAL_MODEL=qwen2.5:7b`
- `TRANSLATION_PROVIDER=local` and `REWRITE_PROVIDER=local`
- `JOB_QUEUE=local` for restart-safe JSON job persistence
- `PYTHON_BIN=` optionally selects the Python executable used by AI Dubbing
- `DEMUCS_MODEL=htdemucs` selects the source-separation model
- `DEMUCS_CACHE_DIR=` optionally selects a short, writable persistent model-cache directory
- `DEMUCS_TIMEOUT_MS=1800000` optionally changes the model-download/separation timeout

Development bypasses login. Production authentication and Prisma remain available and unchanged; configure the Auth.js credentials and `DATABASE_URL` before a multi-user deployment.

## AI Dubbing v2

Translate and save the subtitle track before starting AI Dubbing. The panel selects a default neural voice for Vietnamese, English, Simplified Chinese, Japanese, or Korean, while allowing another listed voice, speech rate, pitch, AI voice volume, and background volume. The default Replace Voice Only mode keeps the Demucs accompaniment stem at 100%, removes the vocals stem, and mixes timed Edge TTS speech at 100%.

Each generated clip is validated with FFprobe and FFmpeg, fitted to its subtitle window when necessary, positioned at the subtitle start time, and mixed into a full-length `voice.wav`. Demucs separates the source into `vocals.wav` and `accompaniment.wav`; only the accompaniment enters the final mix. The two stems and a source-video checksum are cached in `storage/projects/<project-id>/separation`, so separation runs again only when the source video or configured model changes. Downloaded models use a short persistent application cache (`%LOCALAPPDATA%/CNCSubAI/demucs` on Windows or the platform cache directory on Linux) and are reused across projects. The same shared subtitle burn pipeline used by normal Burn produces the final MP4.

When Demucs is unavailable, the UI shows the installation error and disables Replace Voice Only. Choose Replace Entire Audio to use the v1-compatible fallback, which discards all original audio and renders only the timed AI voice. CNCSub AI never silently changes a submitted dubbing mode.

## Verification and production build

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

FFmpeg automatically attempts `h264_nvenc` on supported NVIDIA systems and falls back to `libx264` in automatic mode. Select CPU mode explicitly if the installed FFmpeg lacks NVENC.

## Optional infrastructure

PostgreSQL and Redis are optional and disabled by default. Start them only when testing the production foundation:

```bash
docker compose --profile infrastructure up -d
```

The included Dockerfile packages the Next.js production app, FFmpeg, Python, Edge TTS, and CPU builds of PyTorch and Demucs. A host Ollama service is still required; inside a container set `LOCAL_BASE_URL` to a host-reachable address such as `http://host.docker.internal:11434/v1`. Mount `/app/storage` to retain local projects and the Demucs stem cache.

Never commit `.env.local`, credentials, `storage/`, videos, generated media, `.next/`, or `node_modules/`.
