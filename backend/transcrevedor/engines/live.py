"""WebSockets Live com áudio PCM, backpressure, finais ordenados e sessões limitadas."""

import base64
import itertools
import json
import queue
import threading
import time
from urllib.parse import urlparse, urlunparse

from websockets.sync.client import connect

from .common import encoded, instructions, merge, pcm, safe_error, validate


def frames(command, cancel):
    """PCM mono 16 kHz; arquivos são enviados no ritmo de áudio exigido por Live."""
    if command.get("microphone"):
        source = command["audioQueue"]
        while not cancel.is_set():
            try:
                value = source.get(timeout=0.2)
            except queue.Empty:
                continue
            if value is None:
                return
            yield base64.b64decode(value, validate=True)
    else:
        from ..audio import audio_blocks

        for _, samples, _ in audio_blocks(command["path"], 1):
            raw = pcm(samples)
            for index in range(0, len(raw), 3200):
                if cancel.is_set():
                    return
                yield raw[index : index + 3200]


def address(profile):
    if profile.get("liveUrl"):
        return profile["liveUrl"]
    parsed = urlparse(profile["baseUrl"])
    path = (
        "/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
        if profile["protocol"] == "gemini-live"
        else parsed.path.rstrip("/") + "/realtime"
    )
    return urlunparse(
        (
            "wss" if parsed.scheme == "https" else "ws",
            parsed.netloc,
            path,
            "",
            "" if profile["protocol"] == "gemini-live" else "intent=transcription",
            "",
        )
    )


def transcribe_live(command, cancel, publish):
    profile = command["profile"]
    validate(profile)
    gemini = profile["protocol"] == "gemini-live"
    if gemini and instructions(profile) and profile.get("instructionMode") != "system":
        raise ValueError(
            "Gemini Live: escolha sem instruções para transcrição dedicada ou sistema para modelos compatíveis."
        )
    key = profile.get("apiKey")
    headers = (
        ({"x-goog-api-key": key} if gemini else {"Authorization": "Bearer " + key})
        if key
        else {}
    )
    source = iter(frames(command, cancel))
    started, position, texts, usages = time.monotonic(), 0.0, [], []

    def event(kind, **fields):
        publish(kind, jobId=command.get("jobId"), **fields)

    try:
        while not cancel.is_set():
            first = next(source, None)
            if first is None:
                break
            event("stage", message="Conectando à sessão Live…")
            # Quatro minutos por conexão mantêm margem para o limite de dez do Gemini.
            stream = itertools.chain([first], source)
            with connect(
                address(profile),
                additional_headers=headers,
                open_timeout=15,
                close_timeout=3,
                max_size=4 * 1024 * 1024,
                proxy=None,
            ) as socket:
                if gemini:
                    setup = {
                        "model": "models/" + profile["model"].removeprefix("models/"),
                        "generationConfig": {"responseModalities": ["TEXT"]},
                        "inputAudioTranscription": {},
                    }
                    if instructions(profile):
                        setup["systemInstruction"] = {
                            "parts": [{"text": instructions(profile)}]
                        }
                    if profile.get("temperature") is not None:
                        setup["generationConfig"]["temperature"] = profile[
                            "temperature"
                        ]
                    socket.send(
                        json.dumps({"setup": merge(setup, profile.get("advanced", {}))})
                    )
                else:
                    transcription = {"model": profile["model"]}
                    if instructions(profile):
                        transcription["prompt"] = instructions(profile)
                    session = {
                        "type": "transcription",
                        "audio": {
                            "input": {
                                "format": {"type": "audio/pcm", "rate": 24000},
                                "transcription": transcription,
                                "turn_detection": None,
                            }
                        },
                    }
                    if profile.get("temperature") is not None:
                        session["temperature"] = profile["temperature"]
                    socket.send(
                        json.dumps(
                            {
                                "type": "session.update",
                                "session": merge(session, profile.get("advanced", {})),
                            }
                        )
                    )
                # Não transmite áudio antes do servidor aceitar a configuração.
                deadline = time.monotonic() + 30
                while True:
                    if cancel.is_set():
                        return {"type": "cancelled", "jobId": command.get("jobId")}
                    try:
                        message = json.loads(socket.recv(timeout=0.25))
                    except TimeoutError:
                        if time.monotonic() > deadline:
                            raise ValueError(
                                "O servidor Live não confirmou a configuração em 30 segundos."
                            )
                        continue
                    if message.get("error"):
                        raise ValueError(json.dumps(message["error"]))
                    if (gemini and "setupComplete" in message) or (
                        not gemini
                        and message.get("type")
                        in ("session.updated", "transcription_session.updated")
                    ):
                        break
                event("stage", message="Transcrevendo pela conexão Live…")
                done, failed = threading.Event(), []
                commits = queue.Queue()
                window_start = position
                sent = [position]
                commit_count = [0]

                # Captura a sessão atual antes de iniciar a thread de envio.
                def sender(
                    stream=stream,
                    sent=sent,
                    window_start=window_start,
                    commits=commits,
                    commit_count=commit_count,
                    failed=failed,
                    done=done,
                    socket=socket,
                ):
                    try:
                        turn_start = sent[0]
                        for raw in stream:
                            if cancel.is_set():
                                break
                            seconds = len(raw) / 32000
                            if gemini:
                                socket.send(
                                    json.dumps(
                                        {
                                            "realtimeInput": {
                                                "audio": {
                                                    "mimeType": "audio/pcm;rate=16000",
                                                    "data": encoded(raw),
                                                }
                                            }
                                        }
                                    )
                                )
                            else:
                                # Resample 16->24 kHz antes de enviar ao protocolo OpenAI.
                                import numpy as np

                                samples = np.frombuffer(raw, dtype="<i2").astype(
                                    np.float32
                                )
                                converted = (
                                    np.interp(
                                        np.arange(len(samples) * 3 // 2) * 2 / 3,
                                        np.arange(len(samples)),
                                        samples,
                                    )
                                    .astype("<i2")
                                    .tobytes()
                                )
                                socket.send(
                                    json.dumps(
                                        {
                                            "type": "input_audio_buffer.append",
                                            "audio": encoded(converted),
                                        }
                                    )
                                )
                            sent[0] += seconds
                            if not gemini and sent[0] - turn_start >= 5:
                                commits.put((turn_start, sent[0]))
                                commit_count[0] += 1
                                socket.send(
                                    json.dumps({"type": "input_audio_buffer.commit"})
                                )
                                turn_start = sent[0]
                            if not command.get("microphone"):
                                cancel.wait(seconds)
                            if sent[0] - window_start >= 240:
                                break
                        if not cancel.is_set():
                            if gemini:
                                socket.send(
                                    json.dumps(
                                        {"realtimeInput": {"audioStreamEnd": True}}
                                    )
                                )
                            elif sent[0] - turn_start >= 0.1:
                                commits.put((turn_start, sent[0]))
                                commit_count[0] += 1
                                socket.send(
                                    json.dumps({"type": "input_audio_buffer.commit"})
                                )
                    except Exception as error:  # noqa: BLE001 - propaga falhas da thread e remove credenciais.
                        failed.append(error)
                    finally:
                        done.set()

                worker = threading.Thread(target=sender, daemon=True)
                worker.start()
                ordered, bounds, finished, partial = [], {}, {}, {}
                emitted, last_end, ended_at = 0, position, None
                try:
                    while not cancel.is_set():
                        if failed:
                            raise failed[0]
                        if done.is_set() and ended_at is None:
                            ended_at = time.monotonic()
                        if ended_at and time.monotonic() - ended_at > 60:
                            raise ValueError(
                                "Sessão encerrada sem confirmação final em 60 segundos. Os trechos recebidos foram preservados."
                            )
                        try:
                            data = json.loads(socket.recv(timeout=0.2))
                        except TimeoutError:
                            if (
                                not gemini
                                and done.is_set()
                                and emitted == commit_count[0]
                            ):
                                break
                            continue
                        if data.get("error") or data.get("type", "").endswith(
                            ".failed"
                        ):
                            raise ValueError(json.dumps(data.get("error", data)))
                        if data.get("usageMetadata") or data.get("usage"):
                            usages.append(data.get("usageMetadata", data.get("usage")))
                        if gemini:
                            content = data.get("serverContent", {})
                            interim = content.get("interimInputTranscription", {}).get(
                                "text"
                            )
                            if interim:
                                event("partial", message=interim)
                            text = content.get("inputTranscription", {}).get("text")
                            if text:
                                texts.append(text)
                                event(
                                    "segment",
                                    segment={
                                        "start": last_end,
                                        "end": sent[0],
                                        "text": text,
                                        "timing": "approximate",
                                    },
                                )
                                last_end = sent[0]
                                event("partial", message="")
                            if done.is_set() and content.get("turnComplete"):
                                break
                        else:
                            kind, item = data.get("type"), data.get("item_id")
                            if kind == "input_audio_buffer.committed":
                                ordered.append(item)
                                bounds[item] = commits.get(timeout=5)
                            elif (
                                kind
                                == "conversation.item.input_audio_transcription.delta"
                            ):
                                partial[item] = partial.get(item, "") + data.get(
                                    "delta", ""
                                )
                                event("partial", message=partial[item])
                            elif (
                                kind
                                == "conversation.item.input_audio_transcription.completed"
                            ):
                                finished[item] = data.get("transcript", "")
                            while (
                                emitted < len(ordered) and ordered[emitted] in finished
                            ):
                                item = ordered[emitted]
                                text = finished[item]
                                start, end = bounds[item]
                                if text:
                                    texts.append(text)
                                    event(
                                        "segment",
                                        segment={
                                            "start": start,
                                            "end": end,
                                            "text": text,
                                            "timing": "approximate",
                                        },
                                    )
                                emitted += 1
                                event("partial", message="")
                            if done.is_set() and emitted == commit_count[0]:
                                break
                        event(
                            "progress",
                            percent=None,
                            processed=sent[0],
                            elapsed=time.monotonic() - started,
                        )
                finally:
                    # Fechar o socket desbloqueia escrita; o gerador de microfone observa cancel.
                    if not done.is_set():
                        cancel.set()
                    socket.close()
                    worker.join(timeout=3)
                position = sent[0]
        if not texts and not cancel.is_set():
            raise ValueError("O servidor Live não retornou texto para o áudio enviado.")
        return {
            "type": "cancelled" if cancel.is_set() else "complete",
            "jobId": command.get("jobId"),
            "text": "\n".join(texts),
            "elapsed": time.monotonic() - started,
            "model": profile["model"],
            "usage": usages,
        }
    except Exception as error:  # noqa: BLE001 - propaga falhas da thread e remove credenciais.
        raise ValueError(safe_error(error, profile)) from None
