#!/usr/bin/env python3
"""
Coleta as leituras de uma estação meteorológica via API da nuvem Tuya
e anexa os dados, com timestamp, em um arquivo CSV (estacao.csv).

Uso:
    python3 estacao_tuya.py

Dependência:
    pip install tuya-connector-python

As credenciais podem ser sobrescritas por variáveis de ambiente
(TUYA_ACCESS_ID, TUYA_ACCESS_SECRET, TUYA_DEVICE_ID, TUYA_ENDPOINT),
o que é recomendado se este arquivo for versionado em repositório público.
"""

import csv
import os
import sys
from datetime import datetime
from pathlib import Path

from tuya_connector import TuyaOpenAPI

# ----------------------------------------------------------------------
# Configuração (Project code: p1752408794336gqwnmw)
# ----------------------------------------------------------------------
ACCESS_ID = os.environ.get("TUYA_ACCESS_ID", "aq7ynn9sve3u9n8gku7w")
ACCESS_SECRET = os.environ.get("TUYA_ACCESS_SECRET", "d22b3801be26467c82301367c1bbd17a")
DEVICE_ID = os.environ.get("TUYA_DEVICE_ID", "eb10ba24e88d3576acvgwm")

# Western America Data Center
ENDPOINT = os.environ.get("TUYA_ENDPOINT", "https://openapi.tuyaus.com")

# CSV salvo no mesmo diretório do script (funciona igual quando rodado pelo cron)
CSV_PATH = Path(__file__).resolve().parent / "estacao.csv"

TIMESTAMP_COL = "timestamp"


def coletar_status() -> dict:
    """Conecta na nuvem Tuya e devolve {codigo: valor} com todos os status do device."""
    api = TuyaOpenAPI(ENDPOINT, ACCESS_ID, ACCESS_SECRET)
    api.connect()

    resposta = api.get(f"/v1.0/iot-03/devices/{DEVICE_ID}/status")
    if not resposta.get("success"):
        raise RuntimeError(
            f"Falha na API Tuya (code={resposta.get('code')}): {resposta.get('msg')}"
        )

    # resposta["result"] é uma lista como:
    # [{"code": "va_temperature", "value": 215}, {"code": "va_humidity", "value": 60}, ...]
    return {item["code"]: item["value"] for item in resposta.get("result", [])}


def gravar_csv(leituras: dict) -> None:
    """Anexa uma linha no CSV; cria o arquivo com cabeçalho na primeira execução."""
    agora = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if CSV_PATH.exists() and CSV_PATH.stat().st_size > 0:
        # Reaproveita o cabeçalho existente para manter as colunas alinhadas
        with open(CSV_PATH, "r", newline="", encoding="utf-8") as f:
            colunas = next(csv.reader(f))

        # Se o device passou a reportar códigos novos, avisa mas não quebra o CSV
        novos = sorted(set(leituras) - set(colunas))
        if novos:
            print(
                f"Aviso: códigos novos ignorados (não estão no cabeçalho): {novos}",
                file=sys.stderr,
            )
    else:
        colunas = [TIMESTAMP_COL] + sorted(leituras)
        with open(CSV_PATH, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(colunas)

    linha = {TIMESTAMP_COL: agora, **leituras}
    with open(CSV_PATH, "a", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=colunas, extrasaction="ignore")
        escritor.writerow(linha)

    print(f"{agora} - {len(leituras)} leituras gravadas em {CSV_PATH}")


def main() -> None:
    leituras = coletar_status()
    if not leituras:
        print("Aviso: o device não retornou nenhum status.", file=sys.stderr)
        return
    gravar_csv(leituras)


if __name__ == "__main__":
    main()
