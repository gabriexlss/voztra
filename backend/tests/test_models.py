"""Valida exclusão confinada, deduplicação e ausência de inferência no download."""

import sys
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from transcrevedor.models import (
    repository_dir,
    occupied_bytes,
    delete_model,
    catalog,
    download_model,
)


class ModelTests(unittest.TestCase):
    def test_delete_preserves_other_models_and_history(self):
        with tempfile.TemporaryDirectory() as directory:
            first = repository_dir("tiny", directory)
            second = repository_dir("base", directory)
            first.mkdir()
            second.mkdir()
            (first / "partial.incomplete").write_bytes(b"12345")
            (second / "keep").write_bytes(b"safe")
            self.assertEqual(delete_model("tiny", directory), 5)
            self.assertFalse(first.exists())
            self.assertTrue((second / "keep").exists())
            with self.assertRaises(ValueError):
                delete_model("../base", directory)

    def test_unique_hardlinks_count_once(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / "original").write_bytes(b"123456")
            try:
                os.link(path / "original", path / "link")
            except OSError:
                self.skipTest("Sistema sem hardlinks")
            self.assertEqual(occupied_bytes(path), 6)

    def test_partial_is_not_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = repository_dir("tiny", directory)
            path.mkdir()
            (path / "weights.incomplete").write_bytes(b"123")
            item = catalog(directory)[0]
            self.assertTrue(item["partial"])
            self.assertFalse(item["installed"])

    def test_download_is_separate_from_inference_and_can_cancel(self):
        with tempfile.TemporaryDirectory() as directory:
            stop = threading.Event()
            stop.set()
            with (
                patch(
                    "transcrevedor.models.remote_info",
                    return_value=(
                        SimpleNamespace(sha="revision"),
                        [SimpleNamespace(rfilename="model.bin")],
                    ),
                ),
                patch("transcrevedor.models.hf_hub_download") as download,
            ):
                with self.assertRaises(InterruptedError):
                    download_model("tiny", directory, stop, lambda *_: None)
                download.assert_not_called()

    def test_pinned_snapshot_without_main_ref_is_installed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = repository_dir("tiny", directory) / "snapshots" / ("a" * 40)
            path.mkdir(parents=True)
            for name in (
                "model.bin",
                "config.json",
                "tokenizer.json",
                "vocabulary.txt",
            ):
                (path / name).write_bytes(b"fixture")
            self.assertTrue(catalog(directory)[0]["installed"])
