"""Verifica os imports em processos limpos, sem herdar módulos dos outros testes."""

import subprocess
import sys
import unittest
from pathlib import Path


class WorkerIsolationTests(unittest.TestCase):
    def test_workers_do_not_import_other_engines(self):
        root = Path(__file__).resolve().parents[1]
        for worker, forbidden in (
            (
                "api",
                [
                    "ctranslate2",
                    "faster_whisper",
                    "transcrevedor.models",
                    "transcrevedor.cuda_runtime",
                    "transcrevedor.benchmark",
                ],
            ),
            (
                "gpu",
                [
                    "ctranslate2",
                    "faster_whisper",
                    "transcrevedor.engines.remote",
                    "transcrevedor.engine",
                ],
            ),
            ("whisper", ["transcrevedor.engines.http", "transcrevedor.engines.live"]),
        ):
            with self.subTest(worker=worker):
                script = f"import sys; from transcrevedor.workers.{worker} import Worker; assert not set({forbidden!r}) & set(sys.modules), set({forbidden!r}) & set(sys.modules)"
                result = subprocess.run(
                    [sys.executable, "-c", script],
                    cwd=root,
                    check=False,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
