"""Integridade e isolamento da extração, sem baixar gigabytes nem precisar de GPU."""

import hashlib
import io
import json
import os
import sys
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from transcrevedor import cuda_packages as cuda


class CudaPackagesTests(unittest.TestCase):
    def installation_fixture(self, corrupt=False, interrupt=False):
        """Exercita download, hash, extração, publicação e limpeza com um wheel pequeno."""
        content = io.BytesIO()
        with zipfile.ZipFile(content, "w") as archive:
            for name in cuda.REQUIRED:
                archive.writestr("nvidia/bin/" + name, b"fixture-dll")
            archive.writestr("dist-info/LICENSE", "Licença da fixture")
        wheel = content.getvalue()
        package = {
            "name": "nvidia-test",
            "version": "1",
            "size": len(wheel),
            "sha256": hashlib.sha256(wheel).hexdigest(),
        }
        metadata = {
            "urls": [
                {
                    "filename": "nvidia_test-1-py3-none-win_amd64.whl",
                    "url": "https://files.pythonhosted.org/test.whl",
                    "digests": {"sha256": package["sha256"]},
                }
            ]
        }
        cancel = threading.Event()

        def response(url, **kwargs):
            if url.endswith("/json"):
                return io.BytesIO(json.dumps(metadata).encode())
            if interrupt:
                cancel.set()
            return io.BytesIO(b"corrupt" if corrupt else wheel)

        return package, cancel, response

    def test_full_install_and_remove(self):
        package, cancel, response = self.installation_fixture()
        with (
            tempfile.TemporaryDirectory() as tmp,
            patch.dict(os.environ, {"TRANSCREVEDOR_CUDA_DIR": str(Path(tmp) / "cuda")}),
            patch.object(cuda, "PACKAGES", [package]),
            patch.object(cuda.sys, "platform", "win32"),
            patch.object(cuda.urllib.request, "urlopen", side_effect=response),
            patch.object(cuda.shutil, "disk_usage") as disk,
        ):
            disk.return_value.free = 8 * 1024**3
            progress = []
            result = cuda.install(
                cancel, lambda percent, message: progress.append(percent)
            )
            self.assertTrue(result["installed"])
            self.assertEqual(progress[-1], 100)
            records = json.loads((cuda.root() / "manifest.json").read_text())
            self.assertTrue(
                all(
                    cuda.digest(cuda.root() / r["file"]) == r["sha256"] for r in records
                )
            )
            self.assertFalse((Path(tmp) / "cuda.staging").exists())
            self.assertEqual(cuda.remove()["bytes"], 0)

    def test_corrupt_or_cancelled_download_keeps_existing_installation(self):
        for corrupt, interrupt in [(True, False), (False, True)]:
            with self.subTest(corrupt=corrupt, interrupt=interrupt):
                package, cancel, response = self.installation_fixture(
                    corrupt, interrupt
                )
                with (
                    tempfile.TemporaryDirectory() as tmp,
                    patch.dict(
                        os.environ, {"TRANSCREVEDOR_CUDA_DIR": str(Path(tmp) / "cuda")}
                    ),
                    patch.object(cuda, "PACKAGES", [package]),
                    patch.object(cuda.sys, "platform", "win32"),
                    patch.object(cuda.urllib.request, "urlopen", side_effect=response),
                    patch.object(cuda.shutil, "disk_usage") as disk,
                ):
                    disk.return_value.free = 8 * 1024**3
                    cuda.root().mkdir()
                    (cuda.root() / "existing.dll").write_bytes(b"preservar")
                    with self.assertRaises(ValueError):
                        cuda.install(cancel, lambda *args: None)
                    self.assertEqual(
                        (cuda.root() / "existing.dll").read_bytes(), b"preservar"
                    )
                    self.assertFalse((Path(tmp) / "cuda.staging").exists())

    def test_extraction_does_not_escape_and_keeps_license(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive = root / "package.whl"
            target = root / "cuda"
            target.mkdir()
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("../../outside.dll", b"library")
                z.writestr("dist-info/License.txt", "NVIDIA test fixture")
                z.writestr("include/header.h", "ignored")
            files = cuda.extract(
                archive, target, {"name": "test", "version": "1"}, threading.Event()
            )
            self.assertTrue((target / "outside.dll").exists())
            self.assertFalse((root / "outside.dll").exists())
            self.assertEqual(len(files), 2)
            self.assertEqual(len(files[0]["sha256"]), 64)

    def test_cancel_prevents_extraction(self):
        cancel = threading.Event()
        cancel.set()
        with self.assertRaises(ValueError):
            cuda.cancelled(cancel)

    def test_removal_preserves_models_and_history(self):
        with (
            tempfile.TemporaryDirectory() as tmp,
            patch.dict(os.environ, {"TRANSCREVEDOR_CUDA_DIR": str(Path(tmp) / "cuda")}),
        ):
            models = Path(tmp) / "models"
            models.mkdir()
            (models / "keep").write_text("model")
            root = cuda.root()
            root.mkdir()
            (root / "some.dll").write_bytes(b"test")
            result = cuda.remove()
            self.assertFalse(result["installed"])
            self.assertTrue((models / "keep").is_file())

    def test_pinned_packages_have_expected_windows_hashes(self):
        self.assertEqual(len(cuda.PACKAGES), 4)
        for p in cuda.PACKAGES:
            self.assertEqual(len(p["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
