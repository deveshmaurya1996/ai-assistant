import wave
from io import BytesIO

from models.voice.pcm import is_raw_pcm_filename, pcm_s16le_to_wav_bytes


def test_is_raw_pcm_filename():
    assert is_raw_pcm_filename("audio.raw")
    assert is_raw_pcm_filename("chunk.PCM")
    assert not is_raw_pcm_filename("audio.m4a")


def test_pcm_s16le_to_wav_bytes_wraps_pcm():
    pcm = (b"\x00\x01" * 1000)
    wav = pcm_s16le_to_wav_bytes(pcm, sample_rate=48_000)
    assert wav[:4] == b"RIFF"
    with wave.open(BytesIO(wav), "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == 48_000
        assert len(wf.readframes(wf.getnframes())) == len(pcm)
