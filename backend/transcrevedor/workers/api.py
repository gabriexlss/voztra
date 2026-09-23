"""Worker remoto: não importa Whisper, catálogo local ou runtime CUDA."""

from ..engines.common import safe_error
from ..engines.http import list_models
from ..engines.remote import RemoteEngine
from ..protocol import emit


class Worker:
    def __init__(self, _cache):
        # NumPy/PyAV inicializam suas extensões na thread principal antes de ler stdin.
        # Importar NumPy pela primeira vez no worker pode travar no Windows/Python 3.14.
        from .. import (
            audio,  # noqa: F401 - inicialização intencional do serviço neutro.
        )

        self.engine = RemoteEngine()

    def ready(self):
        return {}

    def execute(self, command, cancel):
        operation = command["type"]
        if operation == "start":
            return self.engine.run(command, cancel, emit)
        if operation == "api-test":
            return self.engine.test(command["profile"], cancel)
        if operation == "api-models":
            try:
                return list_models(command["profile"])
            except Exception as exc:  # noqa: BLE001 - sanitiza qualquer erro do provedor.
                raise ValueError(safe_error(exc, command["profile"])) from None
        raise ValueError("Comando indisponível no motor API.")
