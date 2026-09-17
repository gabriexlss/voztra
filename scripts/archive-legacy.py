"""Arquiva builds conhecidos, verifica cada byte e só então remove as cópias soltas."""
from pathlib import Path
import hashlib
import json
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = (ROOT / "dist").resolve()
ARCHIVE = DIST / "archive"
ARCHIVE.mkdir(exist_ok=True)


def digest(stream):
    value = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        value.update(chunk)
    return value.hexdigest()


def safe(path):
    resolved = path.resolve()
    if not resolved.is_relative_to(DIST) or resolved == DIST or path.is_symlink():
        raise ValueError(f"Caminho fora do escopo: {path}")
    return resolved


inventory = []
for version in ["1.0.0", "1.1.0", "1.1.1", "1.2.0"]:
    folder = DIST / "v1.1.1" if version == "1.1.1" else DIST
    installer = folder / f"transcrevedor-{version}-setup.exe"
    archive = ARCHIVE / f"transcrevedor-{version}.zip"
    if not installer.exists():
        if archive.exists():
            with zipfile.ZipFile(archive) as z:
                inventory.append(json.loads(z.read("manifest.json")))
            continue
        raise FileNotFoundError(installer)
    paths = [installer, Path(str(installer) + ".blockmap")]
    directories = []
    if version == "1.1.1":
        directories.append(folder)
        paths = [p for p in folder.rglob("*") if p.is_file()]
    elif version == "1.2.0":
        directories.append(DIST / "win-unpacked")
        paths.extend(p for p in directories[0].rglob("*") if p.is_file())
    entries = {}
    for path in paths:
        safe(path)
        with path.open("rb") as stream:
            entries[str(path.relative_to(DIST)).replace("\\", "/")] = digest(stream)
    manifest = {"version": version, "files": entries}
    temporary = archive.with_suffix(".zip.tmp")
    with zipfile.ZipFile(temporary, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for path in paths:
            z.write(path, str(path.relative_to(DIST)).replace("\\", "/"))
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
    with zipfile.ZipFile(temporary) as z:
        for name, expected in entries.items():
            with z.open(name) as stream:
                if digest(stream) != expected:
                    raise ValueError(f"Arquivo inválido no ZIP: {name}")
    temporary.replace(archive)
    print(f"{version}: {len(paths)} arquivos verificados em {archive.name}", flush=True)
    inventory.append(manifest)
    if "--prune" in sys.argv:
        for path in paths:
            safe(path)
            with path.open("rb") as stream:
                if digest(stream) != entries[str(path.relative_to(DIST)).replace("\\", "/")]:
                    raise ValueError(f"Arquivo modificado durante o backup: {path}")
        for path in paths:
            safe(path).unlink()
        for directory in directories:
            for child in sorted(directory.rglob("*"), key=lambda p: len(p.parts), reverse=True):
                if child.is_dir():
                    safe(child).rmdir()
            safe(directory).rmdir()
with (ARCHIVE / "inventory.json").open("w", encoding="utf-8") as stream:
    json.dump(inventory, stream, indent=2)
