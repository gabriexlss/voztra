"""Operações locais exclusivas do processo Whisper."""

from ..benchmark import run_benchmark
from ..engine import Engine
from ..hardware import capabilities
from ..models import catalog, delete_model, download_model, remote_info
from ..protocol import emit


class Worker:
    def __init__(self, cache):
        self.engine = Engine(cache)

    def ready(self):
        return {**capabilities(), "models": catalog(self.engine.cache)}

    def execute(self, command, cancel):
        operation = command["type"]
        if operation == "start":
            return self.engine.run(command, cancel)
        if operation == "load":
            result = self.engine.load(command["options"])
        elif operation == "catalog":
            result = catalog(self.engine.cache)
        elif operation == "metadata":
            _, files = remote_info(command["model"])
            result = sum(f.size or 0 for f in files)
        elif operation == "download":
            download_model(
                command["model"],
                self.engine.cache,
                cancel,
                lambda done, total, file: emit(
                    "download",
                    model=command["model"],
                    percent=done / max(total, 1) * 100,
                    message=f"{done}/{total} arquivos · {file}",
                ),
            )
            result = catalog(self.engine.cache)
        elif operation == "delete":
            if (
                self.engine.model is not None
                and self.engine.options["model"] == command["model"]
            ):
                raise ValueError("Descarregue o modelo antes de excluí-lo.")
            delete_model(command["model"], self.engine.cache)
            result = catalog(self.engine.cache)
        elif operation == "benchmark":
            result = run_benchmark(self.engine, cancel)
        else:
            raise ValueError("Comando desconhecido.")
        return result
