from models.voice.wyoming_tts import piper_tcp_target


def test_piper_tcp_target_parses_http_style_url(monkeypatch):
    monkeypatch.setenv("PIPER_URL", "http://localhost:5000")
    assert piper_tcp_target() == ("localhost", 5000)


def test_piper_tcp_target_parses_tcp_url(monkeypatch):
    monkeypatch.setenv("PIPER_URL", "tcp://127.0.0.1:10200")
    assert piper_tcp_target() == ("127.0.0.1", 10200)
