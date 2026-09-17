"""Cria uma versão longa do WAV de teste para exercitar cancelamento."""
from pathlib import Path
import wave

directory = Path(__file__).resolve().parents[1] / ".cache" / "test-data"
with wave.open(str(directory / "speech.wav"), "rb") as source:
    params = source.getparams()
    frames = source.readframes(source.getnframes())
with wave.open(str(directory / "long.wav"), "wb") as output:
    output.setparams(params)
    for _ in range(30):
        output.writeframes(frames)
