"""Instalação opcional de DLLs NVIDIA em diretório privado, sem modificar o SO."""

import hashlib
import json
import os
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path
from urllib.parse import urlparse

PACKAGES = json.loads((Path(__file__).parent / "assets/cuda-packages.json").read_text())
REQUIRED = (
    "cublas64_12.dll",
    "cublasLt64_12.dll",
    "cudnn64_9.dll",
    "cudart64_12.dll",
    "nvrtc64_120_0.dll",
)


def root():
    value = os.environ.get("TRANSCREVEDOR_CUDA_DIR")
    if not value:
        raise ValueError("Diretório privado CUDA não configurado.")
    return Path(value).resolve()


def status():
    directory = root()
    files = list(directory.glob("*")) if directory.is_dir() else []
    staging = directory.with_name(directory.name + ".staging")
    if staging.is_dir():
        files.extend(staging.glob("*"))
    return {
        "installed": all((directory / name).is_file() for name in REQUIRED)
        and (directory / "manifest.json").is_file(),
        "bytes": sum(p.stat().st_size for p in files if p.is_file()),
        "downloadBytes": sum(p["size"] for p in PACKAGES),
        "supported": sys.platform == "win32",
    }


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def cancelled(cancel):
    if cancel.is_set():
        raise ValueError("Instalação NVIDIA cancelada. Nenhum modelo foi alterado.")


def extract(wheel, directory, package, cancel):
    """Extrai somente nomes de arquivo, impedindo caminhos fora do diretório privado."""
    records, licenses = [], 0
    with zipfile.ZipFile(wheel) as archive:
        for item in archive.infolist():
            cancelled(cancel)
            leaf = Path(item.filename).name
            license_file = "license" in leaf.lower() or "eula" in leaf.lower()
            if item.is_dir() or not (leaf.endswith(".dll") or license_file):
                continue
            output = directory / (
                package["name"] + "-" + leaf if license_file else leaf
            )
            checksum = hashlib.sha256()
            with archive.open(item) as source, output.open("wb") as target:
                while chunk := source.read(1024 * 1024):
                    cancelled(cancel)
                    target.write(chunk)
                    checksum.update(chunk)
            licenses += int(license_file)
            records.append(
                {
                    "file": output.name,
                    "sha256": checksum.hexdigest(),
                    "package": package["name"],
                    "version": package["version"],
                }
            )
    if not licenses:
        raise ValueError(
            "O redistribuível não contém sua licença; instalação interrompida."
        )
    return records


def install(cancel, progress):
    if sys.platform != "win32":
        raise ValueError("O instalador opcional NVIDIA é destinado ao Windows.")
    directory = root()
    staging = directory.with_name(directory.name + ".staging")
    # Os alvos são filhos fixos do diretório de dados definido pelo main.
    if staging.parent != directory.parent or staging == directory:
        raise ValueError("Diretório temporário inválido.")
    staging.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(staging).free < 4 * 1024**3:
        raise ValueError(
            "Reserve pelo menos 4 GiB livres para baixar e extrair o runtime NVIDIA."
        )
    total, done, records = sum(p["size"] for p in PACKAGES), 0, []
    try:
        for package in PACKAGES:
            cancelled(cancel)
            name, version = package["name"], package["version"]
            filename = f"{name.replace('-', '_')}-{version}-py3-none-win_amd64.whl"
            wheel = staging / filename
            if not wheel.exists() or digest(wheel) != package["sha256"]:
                with urllib.request.urlopen(
                    f"https://pypi.org/pypi/{name}/{version}/json", timeout=20
                ) as response:
                    info = json.load(response)
                item = next(x for x in info["urls"] if x["filename"] == filename)
                if (
                    item["digests"]["sha256"] != package["sha256"]
                    or urlparse(item["url"]).hostname != "files.pythonhosted.org"
                ):
                    raise ValueError(
                        "Origem ou hash NVIDIA divergente do manifesto do Voztra."
                    )
                loaded = 0
                with (
                    urllib.request.urlopen(item["url"], timeout=20) as response,
                    wheel.open("wb") as output,
                ):
                    while chunk := response.read(1024 * 1024):
                        cancelled(cancel)
                        output.write(chunk)
                        loaded += len(chunk)
                        progress(
                            (done + loaded) / total * 90,
                            f"Baixando {name}: {(done + loaded) / 1024**2:.0f} / {total / 1024**2:.0f} MiB",
                        )
                        if loaded > package["size"]:
                            raise ValueError("Tamanho NVIDIA excede o manifesto.")
                if digest(wheel) != package["sha256"]:
                    raise ValueError("Arquivo NVIDIA corrompido; tente novamente.")
            done += package["size"]
            progress(done / total * 90, f"Verificando e extraindo {name}…")
            records.extend(extract(wheel, staging, package, cancel))
            wheel.unlink()
        cancelled(cancel)
        if not all((staging / name).is_file() for name in REQUIRED):
            raise ValueError("Runtime NVIDIA incompleto.")
        (staging / "manifest.json").write_text(
            json.dumps(records, indent=2), encoding="utf-8"
        )
        # Nenhuma DLL está carregada durante a instalação: o main reinicia o core antes.
        directory.mkdir(parents=True, exist_ok=True)
        for path in staging.iterdir():
            if path.is_file():
                path.replace(directory / path.name)
        staging.rmdir()
        progress(100, "Suporte NVIDIA instalado. Carregue o modelo para usar a GPU.")
        return status()
    except Exception:
        # Cancela também o armazenamento parcial. A versão instalada fica preservada.
        if staging.exists():
            shutil.rmtree(staging)
        raise


def remove():
    directory = root()
    if directory.exists():
        # A origem é fixa, nunca fornecida pelo renderer.
        shutil.rmtree(directory)
    staging = directory.with_name(directory.name + ".staging")
    if staging.exists():
        shutil.rmtree(staging)
    return status()
