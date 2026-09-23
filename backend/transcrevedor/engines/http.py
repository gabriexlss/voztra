"""Protocolos REST explícitos; sem catálogo restritivo, fallback ou repetição paga."""

import json
from urllib.parse import quote

import httpx

from .common import encoded, instructions, merge


def client(profile):
    headers = {}
    if profile.get("apiKey"):
        headers[
            "x-goog-api-key"
            if profile["protocol"].startswith("gemini")
            else "Authorization"
        ] = (
            profile["apiKey"]
            if profile["protocol"].startswith("gemini")
            else "Bearer " + profile["apiKey"]
        )
    return httpx.Client(
        headers=headers, timeout=httpx.Timeout(120, connect=15), follow_redirects=False
    )


def response_json(response):
    if not response.is_success:
        # Retorna o erro do provedor sem incluir o objeto Request ou headers.
        raise ValueError(f"HTTP {response.status_code}: {response.text[:1600]}")
    return response.json()


def list_models(profile):
    """Preserva todos os modelos e paginação. Não deduz modalidade pelo nome."""
    gemini = profile["protocol"].startswith("gemini")
    result, seen = [], set()
    params = {}
    with client(profile) as connection:
        for _ in range(100):
            data = response_json(
                connection.get(
                    profile["baseUrl"].rstrip("/") + "/models", params=params
                )
            )
            for item in data.get("models" if gemini else "data", []):
                identifier = item.get("name" if gemini else "id", "")
                if identifier and identifier not in seen:
                    seen.add(identifier)
                    result.append(
                        {
                            "id": identifier,
                            "name": item.get("displayName") or identifier,
                            "description": item.get("description", ""),
                        }
                    )
            token = data.get("nextPageToken")
            if gemini and token:
                params = {"pageToken": token}
            elif not gemini and data.get("has_more") and data.get("data"):
                params = {"after": data["data"][-1]["id"]}
            else:
                return result
    raise ValueError(
        "Listagem excedeu 100 páginas; informe o identificador manualmente."
    )


def interaction_text(data):
    """REST retorna steps; output_text é também aceito para servidores compatíveis."""
    status = data.get("status")
    if status and status != "completed":
        raise ValueError(f"Interação não concluída pelo provedor (status: {status}).")
    if data.get("output_text"):
        return data["output_text"]
    if "steps" in data:
        # Não incorporar entrada, raciocínio ou resultados de ferramentas ao áudio.
        return "".join(
            part.get("text", "")
            for step in (data.get("steps") or [])
            if step.get("type") == "model_output"
            for part in (step.get("content") or [])
            if part.get("type") == "text"
        )
    return "".join(
        part.get("text", "")
        for part in (data.get("outputs") or [])
        if part.get("type") == "text"
    )


def transcribe(profile, audio):
    """Um bloco WAV pequeno cabe nos limites usuais sem enviar o arquivo inteiro à RAM."""
    base = profile["baseUrl"].rstrip("/")
    model, protocol = profile["model"], profile["protocol"]
    prompt, extra = instructions(profile), profile.get("advanced", {})
    with client(profile) as connection:
        if protocol == "openai-transcription":
            body = {"model": model, "response_format": "json"}
            if prompt:
                body["prompt"] = prompt
            if profile.get("temperature") is not None:
                body["temperature"] = profile["temperature"]
            body = merge(body, extra)
            fields = {
                k: json.dumps(v) if isinstance(v, (dict, list, bool)) else str(v)
                for k, v in body.items()
                if v is not None
            }
            response = connection.post(
                base + "/audio/transcriptions",
                data=fields,
                files={"file": ("audio.wav", audio, "audio/wav")},
            )
            if body.get("response_format") == "text" and response.is_success:
                return response.text, None
            data = response_json(response)
            return data.get("text", ""), data.get("usage")
        if protocol == "openai-chat":
            body = {
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_audio",
                                "input_audio": {
                                    "data": encoded(audio),
                                    "format": "wav",
                                },
                            }
                        ],
                    },
                ],
                "stream": False,
            }
            if prompt:
                if profile.get("instructionMode") == "system":
                    body["messages"].insert(0, {"role": "system", "content": prompt})
                else:
                    body["messages"][0]["content"].insert(
                        0, {"type": "text", "text": prompt}
                    )
            if profile.get("temperature") is not None:
                body["temperature"] = profile["temperature"]
            data = response_json(
                connection.post(base + "/chat/completions", json=merge(body, extra))
            )
            return data["choices"][0]["message"].get("content", ""), data.get("usage")
        if protocol == "gemini-content":
            body = {
                "contents": [
                    {
                        "role": "user",
                        "parts": [
                            {
                                "inlineData": {
                                    "mimeType": "audio/wav",
                                    "data": encoded(audio),
                                }
                            }
                        ],
                    }
                ]
            }
            if prompt:
                if profile.get("instructionMode") == "system":
                    body["systemInstruction"] = {"parts": [{"text": prompt}]}
                else:
                    body["contents"][0]["parts"].insert(0, {"text": prompt})
            if profile.get("temperature") is not None:
                body["generationConfig"] = {"temperature": profile["temperature"]}
            path = quote(model.removeprefix("models/"), safe="")
            data = response_json(
                connection.post(
                    base + f"/models/{path}:generateContent", json=merge(body, extra)
                )
            )
            text = "".join(
                p.get("text", "")
                for c in data.get("candidates", [])
                for p in c.get("content", {}).get("parts", [])
                if not p.get("thought")
            )
            if not text and data.get("promptFeedback"):
                raise ValueError(
                    "Resposta do provedor: " + json.dumps(data["promptFeedback"])
                )
            return text, data.get("usageMetadata")
        if protocol == "gemini-interactions":
            body = {
                "model": model.removeprefix("models/"),
                "input": [
                    {"type": "audio", "data": encoded(audio), "mime_type": "audio/wav"}
                ],
                "store": False,
            }
            if prompt:
                if profile.get("instructionMode") == "system":
                    body["system_instruction"] = prompt
                elif profile.get("instructionMode") == "user":
                    body["input"].insert(0, {"type": "text", "text": prompt})
                else:
                    raise ValueError(
                        "Escolha como enviar as instruções: sem instruções para Transcribe, texto do usuário ou sistema para modelos compatíveis."
                    )
            if profile.get("temperature") is not None:
                body["generation_config"] = {"temperature": profile["temperature"]}
            data = response_json(
                connection.post(base + "/interactions", json=merge(body, extra))
            )
            return interaction_text(data), data.get("usage")
        raise ValueError("Protocolo HTTP desconhecido.")
