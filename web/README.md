# CNCSub AI — local-first subtitle workspace

CNCSub AI is a Next.js subtitle workspace that transcribes with Faster-Whisper, translates and rewrites with a local Ollama model, burns subtitles with FFmpeg, and creates dubbed speech with Edge TTS. The default development workflow is single-user and login-free. Transcription, translation, editing, and rendering are local; AI Dubbing needs internet access to Microsoft's Edge speech service.

## Windows setup

Install Node.js 20+, Python 3.10+, Git, [FFmpeg](https://www.gyan.dev/ffmpeg/builds/), and [Ollama](https://ollama.com/download/windows). Ensure `node`, `npm`, `python`, `ffmpeg`, `ffprobe`, and `ollama` are available in a new PowerShell window. Install Edge TTS into the same Python interpreter CNCSub AI will use:

```powershell
python -m pip install edge-tts
python -m edge_tts --version
```

Linux users can use `python3 -m pip install edge-tts`. CNCSub AI detects `python`, `python3`, and the Windows `py -3` launcher. Set `PYTHON_BIN` in `.env.local` to an absolute Python executable when none of those commands resolve to the desired interpreter.

```powershell
ollama pull qwen2.5:7b
ollama list
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000. Ollama must remain running. Use http://localhost:3000/api/health to diagnose Ollama, the configured model, FFmpeg, FFprobe, Python, and Edge TTS availability. If the health endpoint reports that Edge TTS is missing, run `pip install edge-tts` for the detected interpreter and restart the app. If the model is missing, run `ollama pull qwen2.5:7b`. If Ollama is offline, start it from the Windows application or run `ollama serve`.

Faster-Whisper is invoked by `scripts/transcribe.py`. Install its Python dependencies in the interpreter used by the app if they are not already available. Transcription and generated media stay below `storage/`, which is intentionally ignored by Git.

## Configuration

Copy `.env.example` to `.env.local`. The supported local defaults are:

- `LOCAL_BASE_URL=http://127.0.0.1:11434/v1`
- `LOCAL_TRANSLATION_MODEL=qwen2.5:7b`
- `LOCAL_MODEL=qwen2.5:7b`
- `TRANSLATION_PROVIDER=local` and `REWRITE_PROVIDER=local`
- `JOB_QUEUE=local` for restart-safe JSON job persistence
- `PYTHON_BIN=` optionally selects the Python executable used by AI Dubbing

Development bypasses login. Production authentication and Prisma remain available and unchanged; configure the Auth.js credentials and `DATABASE_URL` before a multi-user deployment.

## AI Dubbing v1

Translate and save the subtitle track before starting AI Dubbing. The panel selects a default neural voice for Vietnamese, English, Simplified Chinese, Japanese, or Korean, while allowing another listed voice, speech rate, pitch, and original-audio volume. The default original volume is 0%, so the final MP4 contains only timed Edge TTS speech.

Each generated clip is validated with FFprobe and FFmpeg, fitted to its subtitle window when necessary, positioned at the subtitle start time, and mixed into a full-length `voice.wav`. The video audio is then replaced and the same shared subtitle burn pipeline used by normal Burn produces the final MP4.

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

The included Dockerfile packages the Next.js production app, FFmpeg, Python, and Edge TTS. A host Ollama service is still required; inside a container set `LOCAL_BASE_URL` to a host-reachable address such as `http://host.docker.internal:11434/v1`. Mount `/app/storage` to retain local projects.

Never commit `.env.local`, credentials, `storage/`, videos, generated media, `.next/`, or `node_modules/`.
