# CNCSub AI — local offline workspace

CNCSub AI is a Next.js subtitle workspace that transcribes with Faster-Whisper, translates and rewrites with a local Ollama model, and burns subtitles with FFmpeg. The default development workflow is single-user, login-free, and does not need PostgreSQL, Redis, Gemini, OpenAI, or another paid API.

## Windows setup

Install Node.js 20+, Python 3.10+, Git, [FFmpeg](https://www.gyan.dev/ffmpeg/builds/), and [Ollama](https://ollama.com/download/windows). Ensure `node`, `npm`, `python`, `ffmpeg`, `ffprobe`, and `ollama` are available in a new PowerShell window.

```powershell
ollama pull qwen2.5:7b
ollama list
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open http://localhost:3000. Ollama must remain running. Use http://localhost:3000/api/health to diagnose Ollama, model, FFmpeg, and FFprobe availability. If the model is missing, run `ollama pull qwen2.5:7b`. If Ollama is offline, start it from the Windows application or run `ollama serve`.

Faster-Whisper is invoked by `scripts/transcribe.py`. Install its Python dependencies in the interpreter used by the app if they are not already available. Transcription and generated media stay below `storage/`, which is intentionally ignored by Git.

## Configuration

Copy `.env.example` to `.env.local`. The supported local defaults are:

- `LOCAL_BASE_URL=http://127.0.0.1:11434/v1`
- `LOCAL_TRANSLATION_MODEL=qwen2.5:7b`
- `LOCAL_MODEL=qwen2.5:7b`
- `TRANSLATION_PROVIDER=local` and `REWRITE_PROVIDER=local`
- `JOB_QUEUE=local` for restart-safe JSON job persistence

Development bypasses login. Production authentication and Prisma remain available and unchanged; configure the Auth.js credentials and `DATABASE_URL` before a multi-user deployment.

## Verification and production build

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

FFmpeg automatically attempts `h264_nvenc` on supported NVIDIA systems (including an RTX 2060 with a compatible driver/FFmpeg build) and falls back to `libx264` in automatic mode. Select CPU mode explicitly if the installed FFmpeg lacks NVENC.

## Optional infrastructure

PostgreSQL and Redis are optional and disabled by default. Start them only when testing the production foundation:

```bash
docker compose --profile infrastructure up -d
```

The included Dockerfile packages the Next.js production app and FFmpeg. A host Ollama service is still required; inside a container set `LOCAL_BASE_URL` to a host-reachable address such as `http://host.docker.internal:11434/v1`. Mount `/app/storage` to retain local projects.

Never commit `.env.local`, credentials, `storage/`, videos, generated media, `.next/`, or `node_modules/`.
