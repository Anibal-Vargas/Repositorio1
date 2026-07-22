"""Leitura do valor medido (mΩ) na foto do display (foto 02) — offline.

Estratégia em duas partes, de confiabilidade bem diferente:

1. :func:`localizarDisplay` — **localiza e recorta o LCD** do miliohmímetro
   MILLIOHM 1 na foto. É a parte robusta: serve para mostrar o display
   ampliado ao operador na tela de revisão.

2. :func:`lerValor` — tenta **reconhecer os dígitos** (7 segmentos) e devolve
   o valor como *sugestão* com um nível de confiança. É "melhor esforço":
   quando não tem certeza (foto borrada, reflexo, dígito ambíguo) devolve
   confiança baixa/``valor=None`` para que o operador digite/corrija.

⚠ Requisito de produto: o valor lido é sempre **sugestão** — a decisão final é
do operador na revisão. Nunca use ``lerValor`` sem etapa de confirmação.

Depende de opencv-python(-headless) e numpy. Se indisponíveis, o app deve
cair para digitação manual.
"""

from __future__ import annotations

from dataclasses import dataclass

try:
    import cv2
    import numpy as np
    DISPONIVEL = True
except ImportError:  # pragma: no cover
    DISPONIVEL = False

# Enquanto o reconhecimento de dígitos não for calibrado com um conjunto real
# de fotos, ele é EXPERIMENTAL: a sugestão é exibida, mas o app NUNCA a
# auto-aceita — o operador sempre confirma. A localização do display, ao
# contrário, já é confiável e pronta para uso.
RECONHECIMENTO_EXPERIMENTAL = True

# Segmentos acesos (a,b,c,d,e,f,g) -> dígito.
_SEG = {
    (1, 1, 1, 1, 1, 1, 0): "0", (0, 1, 1, 0, 0, 0, 0): "1",
    (1, 1, 0, 1, 1, 0, 1): "2", (1, 1, 1, 1, 0, 0, 1): "3",
    (0, 1, 1, 0, 0, 1, 1): "4", (1, 0, 1, 1, 0, 1, 1): "5",
    (1, 0, 1, 1, 1, 1, 1): "6", (1, 1, 1, 0, 0, 0, 0): "7",
    (1, 1, 1, 1, 1, 1, 1): "8", (1, 1, 1, 1, 0, 1, 1): "9",
}


@dataclass
class LeituraOCR:
    """Resultado da leitura do display."""

    valor: float | None      # valor em mΩ (None quando incerto)
    texto: str               # dígitos brutos reconhecidos (ex.: "57.4")
    confianca: float         # 0.0..1.0 (heurística)
    crop = None              # recorte do display (ndarray BGR) para revisão

    @property
    def precisa_revisao(self) -> bool:
        # Enquanto experimental, toda leitura passa por revisão do operador.
        if RECONHECIMENTO_EXPERIMENTAL:
            return True
        return self.valor is None or self.confianca < 0.85


def _localizar_lcd_bbox(img):
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    g = cv2.GaussianBlur(gray, (5, 5), 0)
    melhor = None
    for t in (170, 160, 150, 140, 130, 120):
        thr = cv2.threshold(g, t, 255, cv2.THRESH_BINARY)[1]
        thr = cv2.morphologyEx(thr, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
        cnts, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            x, y, ww, hh = cv2.boundingRect(c)
            area = ww * hh
            ar = ww / max(hh, 1)
            if not (1.6 < ar < 3.8):
                continue
            if not (0.008 * w * h < area < 0.14 * w * h):
                continue
            if y > 0.6 * h:
                continue
            if cv2.countNonZero(thr[y:y + hh, x:x + ww]) / area < 0.55:
                continue
            if melhor is None or y < melhor[1]:
                melhor = (x, y, ww, hh)
        if melhor is not None:
            return melhor
    return melhor


def _tela_interna(lcd):
    g = cv2.cvtColor(lcd, cv2.COLOR_BGR2GRAY)
    thr = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    thr = cv2.morphologyEx(thr, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
    cnts, _ = cv2.findContours(thr, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return lcd
    x, y, ww, hh = cv2.boundingRect(max(cnts, key=cv2.contourArea))
    m = int(0.05 * hh)
    return lcd[max(0, y + m):y + hh - m, max(0, x + m):x + ww - m]


def localizarDisplay(img):
    """Recorta o LCD do medidor na imagem. Devolve ndarray BGR ou ``None``.

    ``img`` pode ser um caminho de arquivo ou um ndarray BGR (OpenCV).
    """
    if not DISPONIVEL:
        return None
    if isinstance(img, str):
        img = cv2.imread(img)
    if img is None:
        return None
    box = _localizar_lcd_bbox(img)
    if box is None:
        return None
    x, y, ww, hh = box
    return img[y:y + hh, x:x + ww]


def _segmentos(cell):
    H, W = cell.shape

    def on(x0, x1, y0, y1, th=0.30):
        r = cell[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)]
        return 1 if r.size and (r > 0).mean() > th else 0

    return (
        on(0.20, 0.80, 0.00, 0.18),  # a
        on(0.62, 1.00, 0.10, 0.48),  # b
        on(0.62, 1.00, 0.52, 0.90),  # c
        on(0.20, 0.80, 0.82, 1.00),  # d
        on(0.00, 0.38, 0.52, 0.90),  # e
        on(0.00, 0.38, 0.10, 0.48),  # f
        on(0.20, 0.80, 0.41, 0.59),  # g
    )


def lerValor(img) -> LeituraOCR:
    """Tenta ler o valor (mΩ) no display. Resultado é *sugestão* p/ revisão."""
    crop = localizarDisplay(img)
    if crop is None:
        r = LeituraOCR(valor=None, texto="", confianca=0.0)
        return r

    tela = _tela_interna(crop)
    g = cv2.GaussianBlur(cv2.cvtColor(tela, cv2.COLOR_BGR2GRAY), (3, 3), 0)
    binv = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    binv = cv2.morphologyEx(binv, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    H, W = binv.shape
    junta = cv2.dilate(binv, np.ones((max(3, int(0.10 * H)), 5), np.uint8))
    cnts, _ = cv2.findContours(junta, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    caixas = [cv2.boundingRect(c) for c in cnts]
    caixas = [b for b in caixas if b[3] > 0.4 * H]
    caixas.sort()

    texto = ""
    conf = []
    for bx, by, bw, bh in caixas:
        cell = binv[by:by + bh, bx:bx + bw]
        if bw / max(bh, 1) < 0.34:
            texto += "1"
            conf.append(1.0)
            continue
        d = _SEG.get(_segmentos(cell), "?")
        texto += d
        conf.append(0.0 if d == "?" else 1.0)

    confianca = (sum(conf) / len(conf)) if conf else 0.0
    valor = None
    if texto and "?" not in texto:
        try:
            valor = float(texto)
        except ValueError:
            valor = None
            confianca = min(confianca, 0.3)

    r = LeituraOCR(valor=valor, texto=texto, confianca=confianca)
    r.crop = crop
    return r
