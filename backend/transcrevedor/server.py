"""Comandos correlacionados e uma única operação mutável por vez."""

import json
import sys
import threading
from .engine import Engine
from .hardware import capabilities, monitor
from .models import catalog, download_model, delete_model, remote_info
from .benchmark import run_benchmark
from .protocol import emit


def main():
    engine = Engine(sys.argv[1])
    stop, cancel = threading.Event(), threading.Event()
    lock = threading.Lock()
    threading.Thread(target=monitor, args=(stop,), daemon=True).start()

    def execute(command):
        result, error = None, None
        operation = command["type"]
        try:
            if operation == "start":
                result = engine.run(command, cancel)
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
        emit("ready", **capabilities(), models=catalog(engine.cache))
        for line in sys.stdin:
            try:
                command = json.loads(line)
                if command["type"] == "cancel":
                    cancel.set()
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
                threading.Thread(target=execute, args=(command,), daemon=True).start()
            except Exception as error:
                emit("error", message=str(error))
    finally:
        cancel.set()
        stop.set()


if __name__ == "__main__":
    main()
