"""Decodificação incremental para evitar carregar horas de áudio na RAM."""

import av
import numpy as np


def audio_blocks(path, seconds=30):
    """Produz blocos mono de 16 kHz e duração estimada pelo contêiner.

    A concatenação é limitada a um bloco. Codecs são validados pela abertura
    do arquivo, e não apenas pela extensão. O resampler é drenado ao final.
    """
    with av.open(path) as container:
        stream = next((s for s in container.streams if s.type == "audio"), None)
        if stream is None:
            raise ValueError("O arquivo não contém uma faixa de áudio.")
        duration = (
            float(stream.duration * stream.time_base)
            if stream.duration
            else float(container.duration or 0) / av.time_base
        )
        resampler = av.AudioResampler(format="s16", layout="mono", rate=16000)
        pending = np.empty(0, dtype=np.float32)
        offset = 0.0

        def frames():
            for frame in container.decode(stream):
                yield from resampler.resample(frame)
            yield from resampler.resample(None)

        for frame in frames():
            samples = frame.to_ndarray().flatten().astype(np.float32) / 32768.0
            pending = np.concatenate((pending, samples))
            while len(pending) >= seconds * 16000:
                count = seconds * 16000
                yield offset, pending[:count], duration
                offset += seconds
                pending = pending[count:]
        if len(pending):
            yield offset, pending, duration
