"""Redistribuíveis NVIDIA oficiais, fixados por versão/hash, sem instalar o Toolkit.

Somente DLLs e licenças são extraídas dos wheels PyPI publicados pela NVIDIA.
O cache é validado em cada build; bibliotecas nunca são copiadas para System32.
"""

import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

# O aplicativo e a build especial usam exatamente o mesmo manifesto versionado.
PACKAGES = json.loads(
    (
        Path(__file__).resolve().parents[1]
        / "backend/transcrevedor/assets/cuda-packages.json"
    ).read_text()
)


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def prepare():
    if sys.platform != "win32":
        return
    root = Path(__file__).resolve().parents[1]
    cache, target = root / ".cache/cuda-wheels", root / "release/cuda"
    cache.mkdir(parents=True, exist_ok=True)
    target.mkdir(parents=True, exist_ok=True)
    manifest = []
    for entry in PACKAGES:
        package, version, expected = entry["name"], entry["version"], entry["sha256"]
        filename = f"{package.replace('-', '_')}-{version}-py3-none-win_amd64.whl"
        wheel = cache / filename
        if not wheel.exists() or digest(wheel) != expected:
            print(f"Baixando redistribuível oficial: {package} {version}", flush=True)
            with urllib.request.urlopen(
                f"https://pypi.org/pypi/{package}/{version}/json", timeout=30
            ) as response:
                info = json.load(response)
            item = next(x for x in info["urls"] if x["filename"] == filename)
            if item["digests"]["sha256"] != expected:
                raise RuntimeError("Hash do catálogo diverge do lock NVIDIA.")
            temporary = wheel.with_suffix(".partial")
            with (
                urllib.request.urlopen(item["url"], timeout=120) as response,
                temporary.open("wb") as output,
            ):
                shutil.copyfileobj(response, output, length=1024 * 1024)
            if digest(temporary) != expected:
                raise RuntimeError("Download NVIDIA corrompido.")
            temporary.replace(wheel)
        licenses = 0
        with zipfile.ZipFile(wheel) as archive:
            for name in archive.namelist():
                leaf = Path(name).name
                license_file = "license" in leaf.lower() or "eula" in leaf.lower()
                if not (name.endswith(".dll") or license_file) or name.endswith("/"):
                    continue
                output = target / (f"{package}-{leaf}" if license_file else leaf)
                with archive.open(name) as source, output.open("wb") as destination:
                    shutil.copyfileobj(source, destination, length=1024 * 1024)
                if license_file:
                    licenses += 1
                manifest.append(
                    {
                        "file": output.name,
                        "sha256": digest(output),
                        "package": package,
                        "version": version,
                    }
                )
        if not licenses:
            raise RuntimeError(f"Licença ausente no pacote {package}.")
        print(f"Verificado e extraído: {package}", flush=True)
    (target / "manifest.json").write_text(
        json.dumps(manifest, indent=2), encoding="utf-8"
    )
    for required in (
        "cublas64_12.dll",
        "cublasLt64_12.dll",
        "cudnn64_9.dll",
        "cudart64_12.dll",
        "nvrtc64_120_0.dll",
    ):
        if not (target / required).is_file():
            raise RuntimeError(f"Runtime incompleto: {required}")
    if "--copy" in sys.argv:
        destination = root / "release/core/transcrevedor-core/_internal/cuda"
        shutil.copytree(target, destination, dirs_exist_ok=True)
        print("Runtime CUDA copiado para o core empacotado.", flush=True)


if __name__ == "__main__":
    prepare()
