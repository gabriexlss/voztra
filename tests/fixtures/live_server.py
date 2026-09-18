"""Servidor Realtime de teste local; não grava áudio nem exige credenciais."""

import json

from websockets.sync.server import serve


def handle(socket):
    item = 0
    for raw in socket:
        message = json.loads(raw)
        kind = message.get("type")
        if kind == "session.update":
            socket.send(json.dumps({"type": "session.updated"}))
        elif kind == "input_audio_buffer.append":
            print("audio", flush=True)
        elif kind == "input_audio_buffer.commit":
            item += 1
            identifier = str(item)
            socket.send(
                json.dumps(
                    {"type": "input_audio_buffer.committed", "item_id": identifier}
                )
            )
            socket.send(
                json.dumps(
                    {
                        "type": "conversation.item.input_audio_transcription.completed",
                        "item_id": identifier,
                        "transcript": "Microfone recebido pelo servidor de teste.",
                    }
                )
            )


with serve(handle, "127.0.0.1", 0) as server:
    print(server.socket.getsockname()[1], flush=True)
    server.serve_forever()
