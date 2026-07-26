"""Resolução de caminhos de recursos (modelos, logo) em dev e no .exe.

Quando empacotado com PyInstaller (``--onefile``), os arquivos de dados ficam
numa pasta temporária apontada por ``sys._MEIPASS``. Em desenvolvimento, ficam
na raiz do projeto (pasta ``desktop/``).
"""

from __future__ import annotations

import os
import sys


def caminho_recurso(*partes: str) -> str:
    """Caminho absoluto de um recurso empacotado (ex.: ``"modelos", "x.docx"``)."""
    base = getattr(sys, "_MEIPASS", None)
    if base:
        return os.path.join(base, *partes)
    # Dev: raiz do projeto = pasta pai de aterramento/.
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(raiz, *partes)
