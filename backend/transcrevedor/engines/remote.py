"""Orquestra arquivos e teste; mantém o consumo limitado a um bloco de áudio."""

import time
from pathlib import Path

from . import http
from .common import safe_error, validate, wav


class RemoteEngine:
    def run(self, command, cancel, publish):
        from ..audio import audio_blocks

        profile, job = command["profile"], command.get("jobId")
        validate(profile)
        started, texts, usages = time.monotonic(), [], []

        def send(event, **fields):
            publish(event, jobId=job, **fields)

        try:
            if profile["protocol"].endswith("live"):
                from .live import transcribe_live

                return transcribe_live(command, cancel, publish)
            for offset, samples, duration in audio_blocks(
                command["path"], profile.get("chunkSeconds", 30)
            ):
                if cancel.is_set():
                    break
                send("stage", message="Enviando áudio e aguardando o provedor…")
                send(
                    "progress",
                    percent=offset / duration * 100 if duration else None,
                    processed=offset,
                    duration=duration,
                    elapsed=time.monotonic() - started,
                )
                text, usage = http.transcribe(profile, wav(samples))
                if cancel.is_set():
                    break
                if not isinstance(text, str):
                    raise TypeError(
                        "O provedor retornou conteúdo sem texto de transcrição."
                    )
                end = offset + len(samples) / 16000
                # Estes tempos são os limites do bloco, não alinhamento de palavras.
                if text.strip():
                    texts.append(text.strip())
                    send(
                        "segment",
                        segment={
                            "start": offset,
                            "end": end,
                            "text": text.strip(),
                            "timing": "approximate",
                        },
                    )
                if usage:
                    usages.append(usage)
                send(
                    "progress",
                    percent=min(99.9, end / duration * 100) if duration else None,
                    processed=end,
                    duration=duration,
                    elapsed=time.monotonic() - started,
                )
            if not cancel.is_set() and not texts:
                raise ValueError(
                    "O provedor concluiu sem retornar texto. Confira modelo, áudio e parâmetros."
                )
            return {
                "type": "cancelled" if cancel.is_set() else "complete",
                "jobId": job,
                "text": "\n".join(texts),
                "elapsed": time.monotonic() - started,
                "model": profile["model"],
                "usage": usages,
            }
        except Exception as error:  # noqa: BLE001 - sanitiza erros antes de atravessar o IPC.
            raise ValueError(safe_error(error, profile)) from None

    def test(self, profile, cancel):
        path = Path(__file__).resolve().parents[1] / "assets" / "benchmark.wav"
        return self.run(
            {"profile": profile, "path": str(path)},
            cancel,
            lambda *args, **kwargs: None,
        )
