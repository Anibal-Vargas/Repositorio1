#!/usr/bin/env python3
"""Coleta leituras de uma estação meteorológica via API da nuvem Tuya.

Conecta na Tuya Cloud com a biblioteca tuya-connector-python, busca todos os
status atuais do device (temperatura, umidade, etc.) e anexa uma linha com
timestamp no arquivo estacao.csv. Se o CSV ainda não existir, ele é criado
com o cabeçalho; se já existir, apenas uma nova linha é adicionada.

Uso:
    python estacao_tuya.py

As credenciais podem ser sobrescritas pelas variáveis de ambiente
TUYA_ACCESS_ID, TUYA_ACCESS_KEY e TUYA_DEVICE_ID.
"""

import csv
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from tuya_connector import TuyaOpenAPI

# ATENÇÃO: evite deixar credenciais reais em repositórios compartilhados.
# Prefira definir as variáveis de ambiente TUYA_ACCESS_ID / TUYA_ACCESS_KEY.
ACCESS_ID = os.getenv("TUYA_ACCESS_ID", "aq7ynn9sve3u9n8gku7w")
ACCESS_KEY = os.getenv("TUYA_ACCESS_KEY", "d22b3801be26467c82301367c1bbd17a")
DEVICE_ID = os.getenv("TUYA_DEVICE_ID", "eb10ba24e88d3576acvgwm")

# Eastern America Data Center
API_ENDPOINT = "https://openapi-ueaz.tuyaus.com"

# O CSV fica sempre ao lado do script, independente do diretório de onde
# o agendador (cron etc.) executar o comando.
CSV_PATH = Path(__file__).resolve().parent / "estacao.csv"

TIMESTAMP_COLUMN = "timestamp"


def coletar_status() -> dict:
    """Busca todos os status do device e devolve {codigo: valor}."""
    openapi = TuyaOpenAPI(API_ENDPOINT, ACCESS_ID, ACCESS_KEY)
    openapi.connect()

    resposta = openapi.get(f"/v1.0/iot-03/devices/{DEVICE_ID}/status")
    if not resposta.get("success"):
        raise RuntimeError(
            f"Falha na API Tuya (code={resposta.get('code')}): "
            f"{resposta.get('msg')}"
        )

    # A API devolve uma lista de {"code": ..., "value": ...}
    return {item["code"]: item["value"] for item in resposta["result"]}


def anexar_no_csv(leituras: dict) -> None:
    """Anexa uma linha no CSV, criando o arquivo com cabeçalho se preciso."""
    linha = {
        TIMESTAMP_COLUMN: datetime.now(timezone.utc)
        .astimezone()
        .isoformat(timespec="seconds"),
        **leituras,
    }

    if CSV_PATH.exists() and CSV_PATH.stat().st_size > 0:
        # Mantém a ordem de colunas do arquivo existente para a linha nova
        # se alinhar corretamente com o cabeçalho já gravado.
        with CSV_PATH.open(newline="", encoding="utf-8") as f:
            colunas = next(csv.reader(f))
        novos = [c for c in linha if c not in colunas]
        if novos:
            print(
                f"Aviso: status novos ignorados (não estão no cabeçalho): {novos}. "
                "Apague o CSV para regravá-lo com todas as colunas.",
                file=sys.stderr,
            )
        with CSV_PATH.open("a", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=colunas, extrasaction="ignore").writerow(linha)
    else:
        colunas = [TIMESTAMP_COLUMN] + sorted(leituras)
        with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=colunas)
            writer.writeheader()
            writer.writerow(linha)


def main() -> int:
    try:
        leituras = coletar_status()
    except Exception as exc:  # rede, credenciais, device offline...
        print(f"Erro ao coletar dados da Tuya: {exc}", file=sys.stderr)
        return 1

    if not leituras:
        print("Device não retornou nenhum status.", file=sys.stderr)
        return 1

    anexar_no_csv(leituras)
    print(f"{len(leituras)} leituras gravadas em {CSV_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
