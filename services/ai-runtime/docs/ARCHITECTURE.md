# Ambient AI Assistant — AI orchestration

Mobile and overlay **never** call OpenAI/Gemini/Pollinations directly. All traffic goes through the API gateway → orchestration routers → provider implementations.

## Routers

- `orchestration/ai_router.py` — capability-based text/reasoning/image routing
- `orchestration/voice_router.py` — classic vs future full-duplex (`nemotron-voicechat`)

## Voice modes

| Mode | When | Providers |
|------|------|-----------|
| `classic` | Default (`VOICE_MODE=classic`) | NVIDIA multimodal STT (phi-4 → gemma-3n) → integrate LLM → Magpie TTS or Pollinations fallback |
| `full_duplex` | Early access only — **not implemented** | nemotron-voicechat S2S (Pipecat/WebRTC); returns 501 on `/voice/live/token` |
| `openai-realtime` | `OPENAI_API_KEY`, Phase 4+ | OpenAI Realtime API |
| `gemini-live` | Android + `GEMINI_API_KEY`, Phase 4+ | Gemini Live native audio |

## API key tiers

| Tier | Keys | Use |
|------|------|-----|
| 1 | `OPENAI_API_KEY`, `GEMINI_API_KEY` | Live voice, premium chat |
| 2 | + `ANTHROPIC_API_KEY` | Reasoning |
| 3 | `POLLINATIONS_API_KEY` | Degraded chat/STT/TTS only — **not** duplex voice |

## Voice transcription pipeline (implemented)

```text
POST /v1/voice/transcribe
  → models/voice/preprocess.py   (ffmpeg: any format → 16 kHz mono WAV + loudness)
  → models/voice/validation.py  (silence + STT hallucination guards)
  → models/voice/transcribe.py   (NVIDIA multimodal STT → Pollinations Whisper)
```

**Requires** `ffmpeg` and `ffprobe` on the ai-runtime host. Check: `python scripts/verify-ffmpeg.py`.

| Module | Role |
|--------|------|
| `models/voice/ffmpeg.py` | ffprobe duration, volumedetect, WAV conversion |
| `models/voice/preprocess.py` | `prepare_upload()` context manager |
| `models/voice/validation.py` | Pre/post STT rejection rules |
| `models/voice/transcribe.py` | Model chain orchestration |
| `models/voice/mime.py` | MIME types for provider APIs |

`models/media.py` retains TTS and image generation only.

## Target provider layout

Evolve `models/registry.py` into provider packages without breaking env-based `resolve_models()`.
