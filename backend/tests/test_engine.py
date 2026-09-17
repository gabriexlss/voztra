"""Testa silêncio, cancelamento e erro sem baixar modelos nos testes rápidos."""

import sys
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from tempfile import TemporaryDirectory
from unittest.mock import patch, MagicMock
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from transcrevedor.engine import Engine


class EngineTests(unittest.TestCase):
    def exercise(self, cancel=False, segments=(), duration=1):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "audio.wav"
            path.touch()
            event = threading.Event()
            if cancel:
                event.set()
            model = MagicMock()
            model.transcribe.return_value = (iter(segments), None)
            engine = Engine(directory)
            engine.model = model
            engine.options = {
                "model": "tiny",
                "device": "cpu",
                "computeType": "int8",
                "threads": 1,
            }
            engine.key = ("tiny", "cpu", 0, "int8", 1)
            with (
                patch(
                    "transcrevedor.engine.audio_blocks",
                    return_value=iter([(0, np.zeros(16000), duration)]),
                ),
                patch("transcrevedor.engine.emit") as emit,
            ):
                result = engine.run(
                    {
                        "jobId": "test",
                        "path": str(path),
                        "options": {
                            "model": "tiny",
                            "device": "cpu",
                            "computeType": "int8",
                            "threads": 1,
                        },
                    },
                    event,
                )
            return emit.call_args_list, model, result

    def test_silence_reaches_completion(self):
        events, _, result = self.exercise()
        self.assertEqual(result["type"], "complete")
        self.assertTrue(any(e.args[0] == "progress" for e in events))

    def test_cancellation_preserves_no_new_segments(self):
        events, model, result = self.exercise(cancel=True)
        self.assertEqual(result["type"], "cancelled")
        self.assertFalse(events)
        model.transcribe.assert_not_called()

    def test_run_never_loads_automatically(self):
        engine = Engine("unused")
        with patch("faster_whisper.WhisperModel") as constructor:
            with self.assertRaisesRegex(ValueError, "manualmente"):
                engine.run({}, threading.Event())
            constructor.assert_not_called()

    def test_load_requires_installed_model(self):
        with TemporaryDirectory() as directory:
            engine = Engine(directory)
            with patch("faster_whisper.WhisperModel") as constructor:
                with self.assertRaisesRegex(ValueError, "Baixe"):
                    engine.load(
                        {
                            "model": "tiny",
                            "device": "cpu",
                            "computeType": "int8",
                            "threads": 1,
                        }
                    )
                constructor.assert_not_called()

    def test_progress_advances_between_segments_without_regressing(self):
        events, _, result = self.exercise(
            segments=[
                SimpleNamespace(start=0, end=0.2, text="Primeiro"),
                SimpleNamespace(start=0.2, end=0.6, text="Segundo"),
                SimpleNamespace(start=0.3, end=0.4, text="Sobreposto"),
            ]
        )
        progress = [e.kwargs for e in events if e.args[0] == "progress"]
        self.assertEqual([e["percent"] for e in progress], [0, 20, 60, 60, 99])
        self.assertIsNone(progress[0]["eta"])
        self.assertEqual(result["percent"], 100)

    def test_unknown_duration_keeps_progress_indeterminate(self):
        events, _, result = self.exercise(duration=0)
        progress = [e.kwargs for e in events if e.args[0] == "progress"]
        self.assertTrue(
            all(e["percent"] is None and e["eta"] is None for e in progress)
        )
        self.assertEqual(progress[-1]["processed"], 1)
        self.assertEqual(result["type"], "complete")
