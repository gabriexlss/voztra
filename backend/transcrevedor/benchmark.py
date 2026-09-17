"""Benchmark opcional com fala sintética incluída, sem download ou envio de áudio."""

import threading
import time
from pathlib import Path
import psutil
from .audio import audio_blocks


def run_benchmark(engine, cancel):
    if engine.model is None:
        raise ValueError("Carregue um modelo para executar o teste.")
    peak = psutil.Process().memory_info().rss
    stopped = threading.Event()

    def sample():
        nonlocal peak
        process = psutil.Process()
        while not stopped.wait(0.05):
            peak = max(peak, process.memory_info().rss)

    monitor = threading.Thread(target=sample, daemon=True)
    monitor.start()
    duration = 0
    started = time.monotonic()
    try:
        for _, samples, _ in audio_blocks(
            str(Path(__file__).parent / "assets" / "benchmark.wav")
        ):
            if cancel.is_set():
                raise InterruptedError("Teste cancelado.")
            segments, _ = engine.model.transcribe(
                samples, language="pt", vad_filter=True, beam_size=5
            )
            for _ in segments:
                if cancel.is_set():
                    raise InterruptedError("Teste cancelado.")
            duration += len(samples) / 16000
        elapsed = time.monotonic() - started
        return dict(
            duration=duration,
            elapsed=elapsed,
            speed=duration / max(elapsed, 0.001),
            peakRam=max(peak, psutil.Process().memory_info().rss),
            options=engine.options,
        )
    finally:
        stopped.set()
        monitor.join()
