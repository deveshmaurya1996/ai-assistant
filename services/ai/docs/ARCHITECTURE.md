# Ambient AI Assistant — AI orchestration

Mobile and overlay **never** call OpenAI/Gemini/Pollinations directly. All traffic goes through the API gateway → orchestration routers → provider implementations.

## Routers

- `orchestration/ai_router.py` — capability-based text/reasoning/image routing
- `orchestration/voice_router.py` — classic vs realtime voice (Pollinations **not** used for voice)

## Voice modes

| Mode | When | Providers |
|------|------|-----------|
| `classic` | Fallback, poor network, `VOICE_MODE=classic` | whisper-1 + TEXT_MODEL + tts-1 (Pollinations fallback Tier 3) |
| `openai-realtime` | `OPENAI_API_KEY`, Phase 4+ | OpenAI Realtime API |
| `gemini-live` | Android + `GEMINI_API_KEY`, Phase 4+ | Gemini Live native audio |

## API key tiers

| Tier | Keys | Use |
|------|------|-----|
| 1 | `OPENAI_API_KEY`, `GEMINI_API_KEY` | Live voice, premium chat |
| 2 | + `ANTHROPIC_API_KEY` | Reasoning |
| 3 | `POLLINATIONS_API_KEY` | Degraded chat/STT/TTS only — **not** duplex voice |

## Target provider layout

```text
services/ai/providers/
  openai/
  gemini/
  claude/
  pollinations/
  local/
  shared/

services/ai/voice/
  classic/
  openai-realtime/
  gemini-live/
  shared/
```

Evolve `models/registry.py` into provider packages without breaking env-based `resolve_models()`.
