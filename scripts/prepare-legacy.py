"""Extrai apenas instaladores legados já arquivados para publicar no GitHub Releases."""
from pathlib import Path
import hashlib
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
for version in ["1.0.0", "1.1.0", "1.1.1", "1.2.0"]:
    folder = root / ".cache" / "publish" / version
    folder.mkdir(parents=True, exist_ok=True)
    lines = []
    with zipfile.ZipFile(root / "dist" / "archive" / f"transcrevedor-{version}.zip") as archive:
        for name in archive.namelist():
            filename = Path(name).name
            if filename not in [f"transcrevedor-{version}-setup.exe", f"transcrevedor-{version}-setup.exe.blockmap"]:
                continue
            target = folder / filename
            with archive.open(name) as source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
            lines.append(f"{hashlib.file_digest(target.open('rb'), 'sha256').hexdigest()}  {filename}")
    if len(lines) != 2:
        raise ValueError(f"Instalador ou blockmap ausente: {version}")
    (folder / "SHA256SUMS.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Publicação preparada: {version}", flush=True)
