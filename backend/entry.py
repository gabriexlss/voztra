"""Ponto de entrada usado no desenvolvimento e no executável empacotado."""

import sys
from transcrevedor.server import main

if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stdin.reconfigure(encoding="utf-8")
    main()
