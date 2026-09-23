"""Ponto de entrada usado no desenvolvimento e no executável empacotado."""

import sys

# Somente o processo Whisper registra diretórios de DLLs de inferência.
if len(sys.argv) <= 2 or sys.argv[2] == "whisper":
    from transcrevedor.cuda_runtime import configure

    configure()
from transcrevedor.server import main

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    main()
