"""Configura busca privada de DLLs antes de importar CTranslate2 no Windows."""

import os
import sys
from pathlib import Path

_directories = []


def configure():
    if os.name != "nt":
        return
    root = Path(
        getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[2] / "release")
    )
    directory = Path(os.environ.get("TRANSCREVEDOR_CUDA_DIR", str(root / "cuda")))
    if not (directory / "manifest.json").is_file():
        directory = root / "cuda"
    if directory.is_dir():
        _directories.append(os.add_dll_directory(str(directory)))
        os.environ["PATH"] = str(directory) + os.pathsep + os.environ.get("PATH", "")


def verify():
    """Diagnóstico antecipado: falhas de LoadLibrary não devem derrubar a inferência."""
    if os.name != "nt":
        return
    import ctypes

    for library in (
        "cublasLt64_12.dll",
        "cublas64_12.dll",
        "cudart64_12.dll",
        "cudnn64_9.dll",
        "nvrtc64_120_0.dll",
    ):
        try:
            ctypes.WinDLL(library)
        except OSError as error:
            raise RuntimeError(
                f"Não foi possível carregar {library}. Instale o suporte NVIDIA na aba Motores e confira o driver da placa. Detalhes: {error}"
            ) from None
