"""Motor Whisper com cache, cancelamento cooperativo e progresso por áudio."""

import os
import time
from pathlib import Path
from .audio import audio_blocks
from .protocol import emit

MODELS = [
    "tiny",
    "base",
    "small",
    "medium",
    "large-v1",
    "large-v2",
    "large-v3",
    "turbo",
]


class Engine:
    """Mantém um único modelo em memória e reutiliza configurações iguais."""

    def __init__(self, cache):
        self.cache = cache
        self.model = None
        self.key = None

    def load(self, options):
        """Carrega somente um snapshot instalado; nunca baixa automaticamente."""
        from faster_whisper import WhisperModel
        import ctranslate2 as ct
        from .models import local_model

        if self.model is not None:
            raise ValueError("Descarregue o modelo atual antes de carregar outro.")
        model = options["model"]
        if model not in MODELS:
            raise ValueError("Modelo desconhecido.")
        device_id = options["device"]
        if device_id != "cpu" and not device_id.startswith("cuda:"):
            raise ValueError("Dispositivo inválido.")
        device = "cuda" if device_id.startswith("cuda:") else "cpu"
        index = int(device_id.split(":")[1]) if device == "cuda" else 0
        supported = ct.get_supported_compute_types(device, index)
        compute = options["computeType"]
        if compute == "auto":
            compute = next(
                t
                for t in (
                    ["float16", "int8_float16", "float32"]
                    if device == "cuda"
                    else ["int8", "float32"]
                )
                if t in supported
            )
        if compute not in supported:
            raise ValueError("Precisão numérica incompatível.")
        threads = int(options["threads"])
        if not 1 <= threads <= (os.cpu_count() or 1):
            raise ValueError("Quantidade de threads inválida.")
        model_path = local_model(model, self.cache)
        if model_path is None:
            raise ValueError("Baixe o modelo na aba Modelos antes de carregá-lo.")
        self.model = WhisperModel(
            model_path,
            device=device,
            device_index=index,
            compute_type=compute,
            cpu_threads=threads,
            local_files_only=True,
        )
        self.key = (model, device, index, compute, threads)
        self.options = dict(options, computeType=compute)
        return self.options

    def run(self, command, cancel):
        """Exige modelo carregado; a configuração de inferência vem da carga ativa."""
        if self.model is None:
            raise ValueError("Carregue um modelo manualmente antes de transcrever.")
        job = command["jobId"]
        options = command["options"]
        for field in ("model", "device", "threads"):
            if options[field] != self.options[field]:
                raise ValueError("A configuração diverge do modelo carregado.")
        if options["computeType"] not in ("auto", self.options["computeType"]):
            raise ValueError("A precisão diverge do modelo carregado.")
        compute = self.options["computeType"]
        path = Path(command["path"])
        if not path.is_file():
            raise ValueError("Arquivo de áudio não encontrado.")
        started = time.monotonic()
        prompt = ""
        processed = 0.0

        def publish_progress(position, duration):
            """Avanço monotônico no áudio original, sem estimar cálculos ainda em execução."""
            nonlocal processed
            position = min(position, duration) if duration > 0 else position
            processed = max(processed, position)
            elapsed = time.monotonic() - started
            speed = processed / max(elapsed, 0.001)
            emit(
                "progress",
                jobId=job,
                percent=min(99, processed / duration * 100) if duration > 0 else None,
                processed=processed,
                duration=duration,
                elapsed=elapsed,
                speed=speed,
                eta=max(0, duration - processed) / speed
                if duration > 0 and speed > 0
                else None,
            )

        if cancel.is_set():
            return {"type": "cancelled", "jobId": job}
        emit("stage", jobId=job, message="Preparando áudio")
        for offset, samples, duration in audio_blocks(str(path)):
            if cancel.is_set():
                return {"type": "cancelled", "jobId": job}
            publish_progress(offset, duration)
            emit("stage", jobId=job, message="Transcrevendo", computeType=compute)
            segments, _ = self.model.transcribe(
                samples,
                language=options.get("language") or None,
                vad_filter=bool(options.get("vad", True)),
                initial_prompt=prompt or None,
                beam_size=5,
            )
            texts = []
            for segment in segments:
                if cancel.is_set():
                    return {"type": "cancelled", "jobId": job}
                text = segment.text.strip()
                if text:
                    emit(
                        "segment",
                        jobId=job,
                        segment={
                            "start": offset + segment.start,
                            "end": offset + segment.end,
                            "text": text,
                        },
                    )
                    texts.append(text)
                # faster-whisper restaura os timestamps após VAD para o áudio original.
                # Limita ao bloco atual e atualiza antes de aguardar o próximo segmento.
                publish_progress(
                    offset + min(max(0, segment.end), len(samples) / 16000), duration
                )
            prompt = " ".join(texts)[-400:]
            publish_progress(offset + len(samples) / 16000, duration)
        if cancel.is_set():
            return {"type": "cancelled", "jobId": job}
        elif processed == 0:
            raise ValueError("O arquivo não contém amostras de áudio decodificáveis.")
        else:
            # O servidor publica o término após liberar o lock para o próximo áudio.
            return {"type": "complete", "jobId": job, "percent": 100}
