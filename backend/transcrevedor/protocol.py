"""Mensagens JSON por linha; stdout pertence exclusivamente ao protocolo."""

import json
import threading

_lock = threading.Lock()


def emit(event: str, **data):
    """Serializa eventos de threads distintas sem misturar suas linhas."""
    with _lock:
        print(json.dumps({"type": event, **data}, ensure_ascii=False), flush=True)
