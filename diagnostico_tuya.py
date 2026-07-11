#!/usr/bin/env python3
"""Diagnóstico de conexão com a Tuya Cloud.

Testa as credenciais contra todos os data centers da Tuya e, onde o token
for aceito, tenta ler os status do device. Use para descobrir em qual data
center o projeto/device realmente está e qual erro cada um retorna.

Uso:
    python diagnostico_tuya.py
"""

import os

from tuya_connector import TuyaOpenAPI

ACCESS_ID = os.getenv("TUYA_ACCESS_ID", "aq7ynn9sve3u9n8gku7w")
ACCESS_KEY = os.getenv("TUYA_ACCESS_KEY", "d22b3801be26467c82301367c1bbd17a")
DEVICE_ID = os.getenv("TUYA_DEVICE_ID", "eb10ba24e88d3576acvgwm")

DATA_CENTERS = {
    "China": "https://openapi.tuyacn.com",
    "Western America": "https://openapi.tuyaus.com",
    "Eastern America": "https://openapi-ueaz.tuyaus.com",
    "Central Europe": "https://openapi.tuyaeu.com",
    "Western Europe": "https://openapi-weaz.tuyaeu.com",
    "India": "https://openapi.tuyain.com",
}


def testar(nome: str, endpoint: str) -> None:
    print(f"\n=== {nome} ({endpoint}) ===")
    try:
        openapi = TuyaOpenAPI(endpoint, ACCESS_ID, ACCESS_KEY)
        token = openapi.connect()
    except Exception as exc:
        print(f"  Falha de rede/conexão: {exc}")
        return

    if not token.get("success"):
        print(f"  TOKEN RECUSADO -> code={token.get('code')} msg={token.get('msg')}")
        return

    print("  Token OK — credenciais válidas neste data center.")
    status = openapi.get(f"/v1.0/iot-03/devices/{DEVICE_ID}/status")
    if status.get("success"):
        leituras = {i["code"]: i["value"] for i in status["result"]}
        print(f"  DEVICE OK — {len(leituras)} status lidos: {leituras}")
    else:
        print(
            f"  Device falhou -> code={status.get('code')} msg={status.get('msg')}"
        )


def main() -> None:
    print(f"Access ID: {ACCESS_ID}")
    print(f"Device ID: {DEVICE_ID}")
    for nome, endpoint in DATA_CENTERS.items():
        testar(nome, endpoint)
    print(
        "\nInterpretação:\n"
        "- 'Token OK' + 'DEVICE OK' em um data center: use esse endpoint no\n"
        "  estacao_tuya.py (variável API_ENDPOINT).\n"
        "- 'Token OK' mas device falha com 'device not found'/'permission':\n"
        "  o projeto está nesse data center, mas o device está vinculado em\n"
        "  outro, ou o app account não foi vinculado ao projeto.\n"
        "- Token recusado em todos com 28841107/'suspended': a assinatura do\n"
        "  IoT Core ainda não está ativa em nenhum data center — reveja a\n"
        "  assinatura na plataforma ou abra um ticket com a Tuya.\n"
    )


if __name__ == "__main__":
    main()
