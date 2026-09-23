"""Manutenção de bibliotecas: nenhum motor de transcrição é carregado."""

from .. import cuda_packages
from ..protocol import emit


class Worker:
    def __init__(self, _cache):
        pass

    def ready(self):
        return {}

    def execute(self, command, cancel):
        operation = command["type"]
        if operation == "cuda-status":
            return cuda_packages.status()
        if operation == "cuda-install":
            return cuda_packages.install(
                cancel,
                lambda percent, message: emit(
                    "download", percent=percent, message=message
                ),
            )
        if operation == "cuda-remove":
            return cuda_packages.remove()
        raise ValueError("Comando indisponível na manutenção GPU.")
