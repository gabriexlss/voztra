"""Contratos reais de rede contra servidores locais, sem chaves e sem cobrança."""

import json
import queue
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import ClassVar
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from transcrevedor.engines.common import merge
from transcrevedor.engines.http import interaction_text, list_models, transcribe
from transcrevedor.engines.remote import RemoteEngine


class Handler(BaseHTTPRequestHandler):
    received: ClassVar[list] = []

    def log_message(self, *_):
        pass

    def reply(self, body, status=200):
        raw = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if "pageToken" in self.path:
            self.reply(
                {
                    "models": [
                        {
                            "name": "models/new-unknown-model",
                            "description": "Modelo novo",
                        }
                    ]
                }
            )
        elif "gemini" in self.path:
            self.reply(
                {"models": [{"name": "models/text-only"}], "nextPageToken": "next"}
            )
        else:
            self.reply({"data": [{"id": "text-only"}, {"id": "unknown-audio"}]})

    def do_POST(self):
        raw = self.rfile.read(int(self.headers["Content-Length"]))
        self.received.append((self.path, raw, self.headers.get("Authorization")))
        if "error" in self.path:
            self.reply({"error": "unsupported parameter; secret-test"}, 400)
        elif self.path.endswith("/audio/transcriptions"):
            self.reply({"text": "Frase de teste.", "usage": {"seconds": 1}})
        elif self.path.endswith("/chat/completions"):
            self.reply({"choices": [{"message": {"content": "Frase de teste."}}]})
        elif self.path.endswith(":generateContent"):
            self.reply(
                {"candidates": [{"content": {"parts": [{"text": "Frase de teste."}]}}]}
            )
        elif self.path.endswith("/interactions"):
            self.reply(
                {
                    "status": "completed",
                    "steps": [
                        {
                            "type": "model_output",
                            "content": [{"type": "text", "text": "Frase de teste."}],
                        }
                    ],
                }
            )


class RemoteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def profile(self, protocol="openai-transcription"):
        return {
            "baseUrl": self.url,
            "protocol": protocol,
            "apiKey": "secret-test",
            "model": "unlisted-model",
            "basePrompt": "Transcreva.",
            "instructions": "Vocabulário.",
            "instructionMode": "user",
            "advanced": {},
            "temperature": None,
            "chunkSeconds": 5,
        }

    def test_discovery_never_filters_text_models_and_follows_pages(self):
        self.assertEqual(len(list_models(self.profile())), 2)
        p = self.profile("gemini-content")
        p["baseUrl"] += "/gemini"
        self.assertEqual(
            [m["id"] for m in list_models(p)],
            ["models/text-only", "models/new-unknown-model"],
        )

    def test_all_rest_protocols_and_json_precedence(self):
        for protocol in (
            "openai-transcription",
            "openai-chat",
            "gemini-content",
            "gemini-interactions",
        ):
            with self.subTest(protocol=protocol):
                p = self.profile(protocol)
                p["advanced"] = {"custom_option": "forwarded", "temperature": 0.7}
                text, _ = transcribe(p, b"test-wave")
                self.assertEqual(text, "Frase de teste.")
                self.assertIn(b"custom_option", Handler.received[-1][1])
                self.assertIn(b"0.7", Handler.received[-1][1])

    def test_gemini_instruction_modes_preserve_text_without_automatic_system(self):
        p = self.profile("gemini-content")
        transcribe(p, b"wave")
        body = json.loads(Handler.received[-1][1])
        self.assertNotIn("systemInstruction", body)
        self.assertIn("Vocabulário", body["contents"][0]["parts"][0]["text"])
        p["instructionMode"] = "system"
        transcribe(p, b"wave")
        self.assertIn("systemInstruction", json.loads(Handler.received[-1][1]))
        p["protocol"] = "gemini-interactions"
        p["instructionMode"] = "none"
        transcribe(p, b"wave")
        body = json.loads(Handler.received[-1][1])
        self.assertNotIn("system_instruction", body)
        self.assertEqual([part["type"] for part in body["input"]], ["audio"])
        self.assertEqual(p["instructions"], "Vocabulário.")

    def test_interactions_rest_steps_and_legacy_outputs(self):
        text = {"type": "text", "text": "Transcrição."}
        self.assertEqual(
            interaction_text(
                {
                    "steps": [
                        {"type": "user_input", "content": [text]},
                        {"type": "thought", "content": [text]},
                        {"type": "model_output", "content": [text]},
                    ]
                }
            ),
            "Transcrição.",
        )
        self.assertEqual(interaction_text({"outputs": [text]}), "Transcrição.")
        self.assertEqual(
            interaction_text({"output_text": "Texto", "steps": []}), "Texto"
        )
        self.assertEqual(interaction_text({"steps": None}), "")
        with self.assertRaisesRegex(ValueError, "incomplete"):
            interaction_text({"status": "incomplete", "output_text": "Parcial"})

    def test_chat_instruction_modes_are_not_silently_lost(self):
        p = self.profile("openai-chat")
        transcribe(p, b"wave")
        body = json.loads(Handler.received[-1][1])
        self.assertEqual(body["messages"][0]["role"], "user")
        self.assertIn("Vocabulário", body["messages"][0]["content"][0]["text"])
        p["instructionMode"] = "system"
        transcribe(p, b"wave")
        self.assertEqual(
            json.loads(Handler.received[-1][1])["messages"][0]["role"], "system"
        )
        p["instructionMode"] = "none"
        transcribe(p, b"wave")
        self.assertEqual(
            len(json.loads(Handler.received[-1][1])["messages"][0]["content"]), 1
        )

    def test_first_audio_request_in_fresh_api_process_completes(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as cache:
            process = subprocess.Popen(
                [sys.executable, "-u", str(root / "entry.py"), cache, "api"],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
            )
            events = queue.Queue()
            reader = threading.Thread(
                target=lambda: [
                    events.put(json.loads(line)) for line in process.stdout
                ],
                daemon=True,
            )
            reader.start()
            try:
                deadline = time.monotonic() + 20
                while time.monotonic() < deadline:
                    if events.get(timeout=20)["type"] == "ready":
                        break
                process.stdin.write(
                    json.dumps(
                        {
                            "type": "api-test",
                            "requestId": "first",
                            "profile": {**self.profile(), "chunkSeconds": 30},
                        }
                    )
                    + "\n"
                )
                process.stdin.flush()
                deadline = time.monotonic() + 15
                response = None
                while time.monotonic() < deadline:
                    event = events.get(timeout=max(0.1, deadline - time.monotonic()))
                    if event["type"] == "response":
                        response = event
                        break
                self.assertIsNotNone(
                    response, "A primeira transcrição do processo não retornou."
                )
                self.assertTrue(response["ok"], response)
                self.assertEqual(response["result"]["text"], "Frase de teste.")
            finally:
                process.kill()
                process.wait(timeout=10)
                reader.join(timeout=2)
                process.stdin.close()
                process.stdout.close()
                process.stderr.close()

    def test_merge_keeps_nested_session_options(self):
        original = {
            "audio": {"input": {"format": "pcm", "transcription": {"model": "x"}}}
        }
        result = merge(
            original, {"audio": {"input": {"transcription": {"language": "pt"}}}}
        )
        self.assertEqual(
            result["audio"]["input"]["transcription"], {"model": "x", "language": "pt"}
        )
        self.assertNotIn("language", original["audio"]["input"]["transcription"])

    def test_provider_errors_redact_secret_without_retry(self):
        p = self.profile()
        p["baseUrl"] += "/error"
        count = len(Handler.received)
        with self.assertRaises(ValueError) as error:
            RemoteEngine().test(p, threading.Event())
        self.assertIn("HTTP 400", str(error.exception))
        self.assertNotIn("secret-test", str(error.exception))
        self.assertEqual(len(Handler.received), count + 1)

    def test_cancellation_does_not_send_audio(self):
        cancel = threading.Event()
        cancel.set()
        with patch("transcrevedor.engines.http.transcribe") as request:
            result = RemoteEngine().test(self.profile(), cancel)
            request.assert_not_called()
            self.assertEqual(result["type"], "cancelled")

    def test_results_mark_block_timing_as_approximate(self):
        events = []
        p = self.profile()
        path = (
            Path(__file__).resolve().parents[1] / "transcrevedor/assets/benchmark.wav"
        )
        result = RemoteEngine().run(
            {"profile": p, "path": str(path), "jobId": "test"},
            threading.Event(),
            lambda kind, **data: events.append((kind, data)),
        )
        self.assertEqual(result["type"], "complete")
        segments = [data["segment"] for kind, data in events if kind == "segment"]
        self.assertTrue(segments)
        self.assertTrue(all(s["timing"] == "approximate" for s in segments))


class LiveTests(unittest.TestCase):
    def test_live_handshake_audio_final_and_close_both_protocols(self):
        from websockets.sync.server import serve

        for protocol in ("openai-live", "gemini-live"):
            with self.subTest(protocol=protocol), tempfile.TemporaryDirectory() as tmp:
                path = Path(tmp) / "speech.wav"
                with wave.open(str(path), "wb") as f:
                    f.setnchannels(1)
                    f.setsampwidth(2)
                    f.setframerate(16000)
                    f.writeframes(b"\0\0" * 4000)
                received = []

                def handler(ws, received=received, protocol=protocol):
                    config = json.loads(ws.recv())
                    received.append(config)
                    gemini = protocol == "gemini-live"
                    ws.send(
                        json.dumps(
                            {"setupComplete": {}}
                            if gemini
                            else {"type": "session.updated"}
                        )
                    )
                    for raw in ws:
                        msg = json.loads(raw)
                        received.append(msg)
                        if gemini and msg.get("realtimeInput", {}).get(
                            "audioStreamEnd"
                        ):
                            ws.send(
                                json.dumps(
                                    {
                                        "serverContent": {
                                            "inputTranscription": {
                                                "text": "Teste Live."
                                            },
                                            "turnComplete": True,
                                        }
                                    }
                                )
                            )
                        elif msg.get("type") == "input_audio_buffer.commit":
                            ws.send(
                                json.dumps(
                                    {
                                        "type": "input_audio_buffer.committed",
                                        "item_id": "a",
                                    }
                                )
                            )
                            ws.send(
                                json.dumps(
                                    {
                                        "type": "conversation.item.input_audio_transcription.delta",
                                        "item_id": "a",
                                        "delta": "Teste",
                                    }
                                )
                            )
                            ws.send(
                                json.dumps(
                                    {
                                        "type": "conversation.item.input_audio_transcription.completed",
                                        "item_id": "a",
                                        "transcript": "Teste Live.",
                                    }
                                )
                            )

                server = serve(handler, "127.0.0.1", 0)
                worker = threading.Thread(target=server.serve_forever, daemon=True)
                worker.start()
                try:
                    p = {
                        "protocol": protocol,
                        "baseUrl": "http://localhost",
                        "liveUrl": f"ws://127.0.0.1:{server.socket.getsockname()[1]}",
                        "model": "any-user-model",
                        "advanced": {},
                    }
                    events = []
                    result = RemoteEngine().run(
                        {"path": str(path), "profile": p},
                        threading.Event(),
                        lambda *a, events=events, **k: events.append((a, k)),
                    )
                    self.assertEqual(result["text"], "Teste Live.")
                    self.assertTrue(any(event[0][0] == "segment" for event in events))
                    self.assertTrue(len(received) >= 3)
                finally:
                    server.shutdown()
                    worker.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
