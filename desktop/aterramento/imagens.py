"""Utilidades de imagem compartilhadas (encaixe sem distorção)."""

from __future__ import annotations

import io


def encaixar(caminho_novo: str, blob_original: bytes, formato: str) -> bytes:
    """Encaixa a imagem ``caminho_novo`` na proporção da original (com padding),
    evitando distorção ao manter o mesmo tamanho de exibição do modelo.

    ``formato`` é ``"png"`` (padding transparente) ou ``"jpeg"`` (padding branco).
    Devolve os bytes da imagem resultante.
    """
    from PIL import Image

    orig = Image.open(io.BytesIO(blob_original))
    aw, ah = orig.size
    nova = Image.open(caminho_novo).convert("RGBA")
    nova.thumbnail((aw, ah), Image.LANCZOS)
    fundo = (0, 0, 0, 0) if formato == "png" else (255, 255, 255, 255)
    canvas = Image.new("RGBA", (aw, ah), fundo)
    canvas.paste(nova, ((aw - nova.width) // 2, (ah - nova.height) // 2), nova)
    buf = io.BytesIO()
    if formato == "png":
        canvas.save(buf, "PNG")
    else:
        canvas.convert("RGB").save(buf, "JPEG", quality=88)
    return buf.getvalue()
