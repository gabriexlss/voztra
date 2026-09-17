"""Catálogo e operações limitadas ao cache de modelos pertencente ao aplicativo."""

import fnmatch
import os
import shutil
from pathlib import Path

is_junction = getattr(os.path, "isjunction", lambda _: False)

from huggingface_hub import HfApi, hf_hub_download

REPOSITORIES = {
    name: f"Systran/faster-whisper-{name}"
    for name in ["tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3"]
}
REPOSITORIES["turbo"] = "mobiuslabsgmbh/faster-whisper-large-v3-turbo"
PATTERNS = [
    "config.json",
    "preprocessor_config.json",
    "model.bin",
    "tokenizer.json",
    "vocabulary.*",
]
# Estimativas de download dos pesos CT2; metadados remotos substituem estes valores.
EXPECTED_MB = dict(
    tiny=75,
    base=145,
    small=485,
    medium=1530,
    **{"large-v1": 3090, "large-v2": 3090, "large-v3": 3090, "turbo": 1620},
)


def repository_dir(name, cache):
    """Aceita somente nomes do catálogo; nunca recebe um caminho da interface."""
    if name not in REPOSITORIES:
        raise ValueError("Modelo desconhecido.")
    root = Path(cache).resolve()
    target = root / ("models--" + REPOSITORIES[name].replace("/", "--"))
    if target.is_symlink() or is_junction(target) or target.resolve().parent != root:
        raise ValueError("O diretório do modelo foi redirecionado; operação recusada.")
    return target


def local_model(name, cache):
    repository = repository_dir(name, cache)
    root = Path(cache).resolve()
    snapshots = repository / "snapshots"
    if not snapshots.is_dir() or not snapshots.resolve().is_relative_to(root):
        return None
    # Downloads fixados por SHA podem não criar refs/main no Hugging Face.
    # Procura snapshots completos locais; nenhum acesso à rede ocorre na carga.
    candidates = sorted(
        (p for p in snapshots.iterdir() if p.is_dir()),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    for path in candidates:
        if (
            path.is_symlink()
            or is_junction(path)
            or not path.resolve().is_relative_to(root)
        ):
            continue
        required = [
            path / filename
            for filename in ("model.bin", "config.json", "tokenizer.json")
        ]
        vocabulary = list(path.glob("vocabulary.*"))
        required.extend(vocabulary)
        if vocabulary and all(
            p.is_file() and p.stat().st_size > 0 and p.resolve().is_relative_to(root)
            for p in required
        ):
            return str(path)
    return None


def occupied_bytes(directory):
    """Conta conteúdo local sem duplicar links físicos ou seguir links simbólicos.

    Tamanho lógico dos arquivos únicos: inclui parciais. Metadados e tamanho
    de clusters do sistema de arquivos podem gerar pequena diferença no SO.
    """
    total, seen = 0, set()
    if not directory.exists():
        return 0
    for root, dirs, files in os.walk(directory, followlinks=False):
        dirs[:] = [
            d
            for d in dirs
            if not is_junction(Path(root) / d) and not (Path(root) / d).is_symlink()
        ]
        for name in files:
            path = Path(root) / name
            if path.is_symlink():
                continue
            stat = path.stat()
            key = (stat.st_dev, stat.st_ino)
            if key not in seen:
                seen.add(key)
                total += stat.st_size
    return total


def catalog(cache):
    entries = []
    for name in REPOSITORIES:
        try:
            directory = repository_dir(name, cache)
            size = occupied_bytes(directory)
            installed = local_model(name, cache) is not None
            entries.append(
                dict(
                    name=name,
                    bytes=size,
                    installed=installed,
                    partial=bool(size and not installed),
                    downloadBytes=EXPECTED_MB[name] * 1000000,
                    estimated=True,
                )
            )
        except ValueError as error:
            entries.append(
                dict(
                    name=name,
                    bytes=0,
                    installed=False,
                    partial=False,
                    downloadBytes=EXPECTED_MB[name] * 1000000,
                    estimated=True,
                    error=str(error),
                )
            )
    return entries


def remote_info(name):
    if name not in REPOSITORIES:
        raise ValueError("Modelo desconhecido.")
    info = HfApi().model_info(REPOSITORIES[name], files_metadata=True)
    files = [
        f
        for f in info.siblings
        if any(fnmatch.fnmatch(f.rfilename, p) for p in PATTERNS)
    ]
    return info, files


def download_model(name, cache, cancel, notify):
    """Download explícito e retomável, fixado em uma revisão do repositório."""
    repository_dir(name, cache)
    info, files = remote_info(name)
    for index, file in enumerate(files):
        if cancel.is_set():
            raise InterruptedError("Download cancelado.")
        notify(index, len(files), file.rfilename)
        hf_hub_download(
            REPOSITORIES[name], file.rfilename, revision=info.sha, cache_dir=cache
        )
    if cancel.is_set():
        raise InterruptedError("Download cancelado.")
    notify(len(files), len(files), "Concluído")
    if local_model(name, cache) is None:
        raise ValueError(
            "Download incompleto. Tente novamente para retomar os arquivos."
        )


def delete_model(name, cache):
    """Apaga apenas um repositório conhecido, após validação de toda a árvore."""
    target = repository_dir(name, cache)
    if not target.exists():
        return 0
    for root, dirs, _ in os.walk(target, followlinks=False):
        for directory in dirs:
            path = Path(root) / directory
            if path.is_symlink() or is_junction(path):
                raise ValueError("Link de diretório no cache; exclusão recusada.")
    size = occupied_bytes(target)
    shutil.rmtree(target)
    return size
