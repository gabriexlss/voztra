"""Comandos correlacionados e uma única operação mutável por vez."""

import json
import sys
import threading
import queue
from .hardware import capabilities, monitor
from .models import catalog, download_model, delete_model, remote_info
from .benchmark import run_benchmark
from .protocol import emit


def main():
    api_mode = len(sys.argv) > 2 and sys.argv[2] == "api"
    if api_mode:
        from .engines.remote import RemoteEngine

        engine = RemoteEngine()
    else:
        from .engine import Engine

        engine = Engine(sys.argv[1])
    audio_queue = queue.Queue(maxsize=600)
    stop, cancel = threading.Event(), threading.Event()
    lock = threading.Lock()
    threading.Thread(target=monitor, args=(stop,), daemon=True).start()

    def execute(command):
        result, error = None, None
        operation = command["type"]
        try:
            if operation.startswith("cuda-"):
                from . import cuda_packages

                if operation == "cuda-status":
                    result = cuda_packages.status()
                elif operation == "cuda-install":
                    result = cuda_packages.install(
                        cancel,
                        lambda percent, message: emit(
                            "download", percent=percent, message=message
                        ),
                    )
                elif operation == "cuda-remove":
                    result = cuda_packages.remove()
                else:
                    raise ValueError("Operação NVIDIA inválida.")
            elif operation == "start":
                if api_mode:
                    command["audioQueue"] = audio_queue
                    result = engine.run(command, cancel, emit)
                else:
                    result = engine.run(command, cancel)
            elif operation == "api-models" and api_mode:
                from .engines.http import list_models
                from .engines.common import safe_error

                try:
                    result = list_models(command["profile"])
                except Exception as exc:
                    raise ValueError(safe_error(exc, command["profile"])) from None
            elif operation == "api-test" and api_mode:
                result = engine.test(command["profile"], cancel)
            elif operation == "load":
                result = engine.load(command["options"])
            elif operation == "catalog":
                result = catalog(engine.cache)
            elif operation == "metadata":
                _, files = remote_info(command["model"])
                result = sum(f.size or 0 for f in files)
            elif operation == "download":
                download_model(
                    command["model"],
                    engine.cache,
                    cancel,
                    lambda done, total, file: emit(
                        "download",
                        model=command["model"],
                        percent=done / max(total, 1) * 100,
                        message=f"{done}/{total} arquivos · {file}",
                    ),
                )
                result = catalog(engine.cache)
            elif operation == "delete":
                if (
                    engine.model is not None
                    and engine.options["model"] == command["model"]
                ):
                    raise ValueError("Descarregue o modelo antes de excluí-lo.")
                delete_model(command["model"], engine.cache)
                result = catalog(engine.cache)
            elif operation == "benchmark":
                result = run_benchmark(engine, cancel)
            else:
                raise ValueError("Comando desconhecido.")
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
        if api_mode:
            emit("ready", models=[])
        else:
            emit("ready", **capabilities(), models=catalog(engine.cache))
        for line in sys.stdin:
            try:
                command = json.loads(line)
                if command["type"] == "cuda-status":
                    # Consulta somente metadados de disco; não disputa o worker de inferência.
                    from .cuda_packages import status

                    emit(
                        "response",
                        requestId=command.get("requestId"),
                        result=status(),
                        ok=True,
                    )
                    continue
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
