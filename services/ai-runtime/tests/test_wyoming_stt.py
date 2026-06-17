from models.voice.wyoming_stt import faster_whisper_tcp_target


def test_faster_whisper_tcp_target_defaults_to_10300(monkeypatch):
    monkeypatch.delenv("FASTER_WHISPER_URL", raising=False)
    assert faster_whisper_tcp_target() == ("localhost", 10300)


def test_faster_whisper_tcp_target_parses_url(monkeypatch):
    monkeypatch.setenv("FASTER_WHISPER_URL", "tcp://whisper.local:10300")
    assert faster_whisper_tcp_target() == ("whisper.local", 10300)
