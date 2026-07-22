"""Gera um pacote .zip de exemplo no formato exportado pelo PWA.

Uso:
    python -m ferramentas.gerar_exemplo [saida.zip]

Serve apenas para desenvolvimento/teste do leitor e dos geradores de
documentos enquanto não temos um .zip real da inspeção. Cria fotos JPEG
sintéticas (retângulos coloridos) para simular o conteúdo.
"""

from __future__ import annotations

import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone


def _jpeg(cor: tuple[int, int, int], texto: str) -> bytes:
    """Cria um JPEG pequeno com uma cor de fundo e um rótulo (se houver Pillow)."""
    try:
        from PIL import Image, ImageDraw

        img = Image.new("RGB", (800, 600), cor)
        draw = ImageDraw.Draw(img)
        draw.rectangle([10, 10, 790, 590], outline=(255, 255, 255), width=4)
        draw.text((30, 30), texto, fill=(255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=80)
        return buf.getvalue()
    except ImportError:
        # JPEG mínimo válido (1x1) caso Pillow não esteja instalado.
        return bytes.fromhex(
            "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707"
            "07090908" + "0a" * 100 + "ffd9"
        )


def gerar(saida: str) -> str:
    criada_em = int(datetime(2026, 7, 21, tzinfo=timezone.utc).timestamp() * 1000)
    cliente = {"id": 1, "nome": "Metalúrgica Exemplo Ltda", "criadoEm": 0}
    inspecao = {
        "id": 1,
        "clienteId": 1,
        "inspetor": "Aníbal Vargas",
        "observacoes": "Inspeção de demonstração gerada para testes.",
        "status": "finalizada",
        "criadaEm": criada_em,
    }

    # (nome, setor, resultado, observacao, fotos_dict, tem_audio, tem_obs_txt)
    equipamentos_def = [
        (
            "01 - Prensa hidráulica PH-01", "Estamparia", "Conforme",
            "Medição dentro do esperado.",
            {"maquina": ["01.jpg"], "valor": ["02.jpg"], "prancheta": ["03.jpg"],
             "adicional": ["04.jpg"]},
            True,
        ),
        (
            "02 - Furadeira de bancada FB-02", "Estamparia", "Não conforme",
            "Resistência acima do limite; recomendada correção do aterramento.",
            {"maquina": ["01.jpg"], "valor": ["02.jpg"]},
            False,
        ),
        (
            "03 - Torno mecânico TM-03", "Usinagem", "Conforme", "",
            {"maquina": ["01.jpg"], "valor": ["02.jpg"], "adicional": ["04.jpg", "05.jpg"]},
            False,
        ),
        (
            # Máquina pendente: falta a foto do valor (02) e o resultado.
            "04 - Esmerilhadeira ES-04", "Usinagem", None, "",
            {"maquina": ["01.jpg"]},
            False,
        ),
    ]

    equipamentos_json = []
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for idx, (nome, setor, resultado, obs, fotos, tem_audio) in enumerate(
            equipamentos_def, start=1
        ):
            pasta = f"Fotos/{nome}"
            # Fotos sintéticas.
            cores = {"maquina": (90, 110, 140), "valor": (60, 90, 60),
                     "prancheta": (120, 100, 80), "adicional": (100, 100, 100)}
            for categoria, nomes in fotos.items():
                for arq in nomes:
                    z.writestr(f"{pasta}/{arq}", _jpeg(cores[categoria], f"{nome}\n{arq}"))
            # resultado.txt (minúsculo, só se preenchido).
            if resultado:
                z.writestr(f"{pasta}/resultado.txt", resultado.lower())
            # observação.txt (só se preenchida).
            if obs:
                z.writestr(f"{pasta}/observação.txt", obs)
            # áudio.
            audios = []
            if tem_audio:
                z.writestr(f"{pasta}/áudio.webm", b"\x1aE\xdf\xa3fake-webm")
                audios = ["áudio.webm"]

            equipamentos_json.append({
                "id": idx,
                "clienteId": 1,
                "setorId": idx,
                "nome": nome,
                "setor": setor,
                "pasta": pasta,
                "resultadoMedicao": resultado,
                "observacao": obs,
                "fotos": fotos,
                "audios": audios,
            })

        dados = {
            "aplicativo": "Continuidade de Aterramento v1.8.0",
            "exportadoEm": datetime.now(timezone.utc).isoformat(),
            "cliente": cliente,
            "inspecao": inspecao,
            "equipamentos": equipamentos_json,
        }
        z.writestr("dados.json", json.dumps(dados, ensure_ascii=False, indent=2))
        z.writestr("relatorio.html", "<!DOCTYPE html><html><body>Relatório de referência.</body></html>")

    return saida


if __name__ == "__main__":
    destino = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(__file__), "..", "exemplos", "aterramento-metalurgica-exemplo-2026-07-21.zip"
    )
    destino = os.path.abspath(destino)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    gerar(destino)
    print(f"Pacote de exemplo gerado em: {destino}")
