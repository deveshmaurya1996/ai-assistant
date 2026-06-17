# Voice pipeline (server)

All chat/assistant dictation uploads flow through here before STT.

## Requirements

- **ffmpeg** and **ffprobe** on `PATH`
- Faster-Whisper server (`FASTER_WHISPER_URL`)
- Piper TTS server (`PIPER_URL`, Wyoming TCP — e.g. `tcp://localhost:5000`)

```bash
python scripts/verify-ffmpeg.py
```

## Flow

1. `prepare_upload(bytes, filename)` — save upload, ffmpeg → 16 kHz mono WAV, measure loudness
2. `validation.reject_before_transcription(metrics)` — too short / too quiet → error
3. STT via Faster-Whisper
4. `validation.reject_after_transcription(text, metrics)` — silence hallucinations

## Mobile

The app uses local dB metering before upload; ffmpeg runs on **ai-runtime**, not on the phone.

## Current defaults

- STT: `faster-whisper`
- TTS: `piper`
