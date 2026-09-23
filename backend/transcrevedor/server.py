"""Comandos correlacionados e uma única operação mutável por vez."""

import json
import sys
import threading
import queue
from .hardware import monitor
from .protocol import emit


def main():
    mode = sys.argv[2] if len(sys.argv) > 2 else "whisper"
    api_mode = mode == "api"
    # Importa exclusivamente o dispatcher escolhido, sem inicializar os demais motores.
    if mode == "api":
        from .workers.api import Worker
    elif mode == "gpu":
        from .workers.gpu import Worker
    elif mode == "whisper":
        from .workers.whisper import Worker
    else:
        raise ValueError("Motor desconhecido.")
    worker = Worker(sys.argv[1])
    audio_queue = queue.Queue(maxsize=600)
    stop, cancel = threading.Event(), threading.Event()
    lock = threading.Lock()
    if mode != "gpu":
        threading.Thread(target=monitor, args=(stop,), daemon=True).start()

    def execute(command):
        result, error = None, None
        operation = command["type"]
        try:
            if api_mode and operation == "start":
                command["audioQueue"] = audio_queue
            result = worker.execute(command, cancel)
        except Exception as exc:
            error = str(exc)
        finally:
            lock.release()
        # O próximo áudio só é liberado na interface quando o worker já está livre.
        if operation == "start":
            if error is not None:
                emit("error", jobId=command.get("jobId"), message=error)
            else:
                emit(result.pop("type"), **result)
        if command.get("requestId"):
            emit(
                "response",
                requestId=command["requestId"],
                result=result,
                message=error,
                ok=error is None,
            )

    try:
        emit("ready", **worker.ready())
        for line in sys.stdin:
            try:
                command = json.loads(line)
                if command["type"] == "cancel":
                    cancel.set()
                    continue
                if command["type"] in ("live-frame", "live-end") and api_mode:
                    try:
                        audio_queue.put_nowait(
                            command.get("audio")
                            if command["type"] == "live-frame"
                            else None
                        )
                    except queue.Full:
                        cancel.set()
                        emit(
                            "stage",
                            jobId=command.get("jobId"),
                            message="O provedor não acompanha o microfone. Buffer de 60 segundos esgotado; cancelando a gravação.",
                        )
                    continue
                if not lock.acquire(blocking=False):
                    emit(
                        "error" if command["type"] == "start" else "response",
                        jobId=command.get("jobId"),
                        requestId=command.get("requestId"),
                        ok=False,
                        message="O core está ocupado.",
                    )
                    continue
                cancel.clear()
                if command["type"] == "start":
                    while not audio_queue.empty():
                        audio_queue.get_nowait()
                threading.Thread(target=execute, args=(command,), daemon=True).start()
            except Exception as error:
                emit("error", message=str(error))
    finally:
        cancel.set()
        stop.set()


if __name__ == "__main__":
    main()
