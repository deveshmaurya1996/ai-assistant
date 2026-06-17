from voice_orchestration.voice_mode import livekit_configured, resolve_voice_mode


def test_resolve_voice_mode_unconfigured(monkeypatch):
    monkeypatch.delenv("LIVEKIT_URL", raising=False)
    monkeypatch.delenv("LIVEKIT_API_KEY", raising=False)
    monkeypatch.delenv("LIVEKIT_API_SECRET", raising=False)
    decision = resolve_voice_mode("user-1")
    assert decision.mode == "unconfigured"
    assert decision.available == []
    assert decision.stt_provider == "faster-whisper"
    assert decision.tts_provider == "piper"
    assert livekit_configured() is False


def test_resolve_voice_mode_livekit(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "ws://localhost:7880")
    monkeypatch.setenv("LIVEKIT_API_KEY", "devkey")
    monkeypatch.setenv("LIVEKIT_API_SECRET", "secret")
    decision = resolve_voice_mode("user-1")
    assert decision.mode == "livekit"
    assert decision.available == ["livekit"]
    assert livekit_configured() is True
