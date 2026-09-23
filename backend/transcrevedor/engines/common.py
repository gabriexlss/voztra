"""Preparação limitada a um bloco e configuração reproduzível dos provedores."""

import base64
import copy
import io
import wave
from urllib.parse import urlparse


def merge(base, extra):
    """JSON avançado prevalece; dicionários são mesclados sem alterar o perfil salvo."""
    result = copy.deepcopy(base)
    for key, value in extra.items():
        result[key] = (
            merge(result[key], value)
            if isinstance(value, dict) and isinstance(result.get(key), dict)
            else copy.deepcopy(value)
        )
    return result


def validate(profile):
    if not profile.get("model", "").strip():
        raise ValueError("Selecione ou informe um modelo. O teste é opcional.")
    parsed = urlparse(profile["baseUrl"])
    if (
        parsed.scheme not in ("http", "https")
        or not parsed.hostname
        or parsed.username
        or parsed.password
    ):
        raise ValueError("URL base inválida.")


def instructions(profile):
    if profile.get("instructionMode") == "none":
        return ""
    return "\n\n".join(
        s.strip()
        for s in (profile.get("basePrompt", ""), profile.get("instructions", ""))
        if s.strip()
    )


def pcm(samples):
    import numpy as np

    return (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()


def wav(samples):
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(16000)
        audio.writeframes(pcm(samples))
    return output.getvalue()


def encoded(data):
    return base64.b64encode(data).decode("ascii")


def safe_error(error, profile):
    """O provedor pode repetir credenciais na mensagem; elas não chegam aos logs/UI."""
    message = str(error)
    key = profile.get("apiKey", "")
    if key:
        message = message.replace(key, "[chave removida]")
    return message[:2000]
