# Voice pipeline (server)

All chat/assistant dictation uploads flow through here before STT.

## Requirements

- **ffmpeg** and **ffprobe** on `PATH`
- API keys per `planner-config/ai-models.yaml` (`NVIDIA_API_KEY`, `POLLINATIONS_API_KEY`)

```bash
python scripts/verify-ffmpeg.py
```

## Flow

1. `prepare_upload(bytes, filename)` — save upload, ffmpeg → 16 kHz mono WAV, measure loudness
2. `validation.reject_before_transcription(metrics)` — too short / too quiet → error
3. Model chain (Phi-4 / Gemma / Whisper)
4. `validation.reject_after_transcription(text, metrics)` — silence hallucinations

## Mobile

The app uses local dB metering before upload; ffmpeg runs on **ai-runtime**, not on the phone.
