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
import socket
import sys
from datetime import datetime
from pathlib import Path

# A Tuya valida a região do IP de origem e costuma rejeitar IPv6 com o erro
# 1114 ("your ip don't have access to this API"). Forçamos IPv4 em todas as
# conexões. Defina TUYA_PERMITIR_IPV6=1 para desativar este ajuste.
if os.environ.get("TUYA_PERMITIR_IPV6") != "1":
    _getaddrinfo_original = socket.getaddrinfo

    def _getaddrinfo_somente_ipv4(host, port, family=0, *args, **kwargs):
        return _getaddrinfo_original(host, port, socket.AF_INET, *args, **kwargs)

    socket.getaddrinfo = _getaddrinfo_somente_ipv4

from tuya_connector import TuyaOpenAPI

# ----------------------------------------------------------------------
# Configuração (Project code: p1752408794336gqwnmw)
# ----------------------------------------------------------------------
ACCESS_ID = os.environ.get("TUYA_ACCESS_ID", "aq7ynn9sve3u9n8gku7w")
ACCESS_SECRET = os.environ.get("TUYA_ACCESS_SECRET", "d22b3801be26467c82301367c1bbd17a")
DEVICE_ID = os.environ.get("TUYA_DEVICE_ID", "eb10ba24e88d3576acvgwm")

# Western America Data Center
ENDPOINT = os.environ.get("TUYA_ENDPOINT", "https://openapi.tuyaus.com")

# Todos os data centers da Tuya, para o modo --testar-endpoints
ENDPOINTS_CONHECIDOS = {
    "Western America": "https://openapi.tuyaus.com",
    "Eastern America": "https://openapi-ueaz.tuyaus.com",
    "Central Europe": "https://openapi.tuyaeu.com",
    "Western Europe": "https://openapi-weaz.tuyaeu.com",
    "India": "https://openapi.tuyain.com",
    "China": "https://openapi.tuyacn.com",
}

# CSV salvo no mesmo diretório do script (funciona igual quando rodado pelo cron)
CSV_PATH = Path(__file__).resolve().parent / "estacao.csv"

TIMESTAMP_COL = "timestamp"


# Dicas para os erros mais comuns da API Tuya, indexadas pelo campo "code"
DICAS_ERRO = {
    1004: "Assinatura inválida: confira o Access Secret e sincronize o relógio do computador.",
    1010: "Token inválido: geralmente o endpoint não corresponde ao data center do projeto.",
    1106: "Sem permissão: verifique se o device está vinculado a este projeto no console Tuya.",
    1109: "Endpoint errado: confira o data center do projeto no console Tuya.",
    1114: "IP de origem rejeitado: se o IP mostrado for IPv6, force IPv4; "
    "se for IPv4, o data center do projeto não atende a sua região.",
    2007: "Data center incorreto para estas credenciais: ajuste o ENDPOINT.",
    28841105: "Assinatura do plano IoT Core expirou: renove em Cloud > projeto > Service API.",
}


def _detalhar_erro(resposta: dict, contexto: str) -> str:
    code = resposta.get("code")
    msg = f"{contexto} (code={code}): {resposta.get('msg')}"
    dica = DICAS_ERRO.get(code)
    return f"{msg}\nDica: {dica}" if dica else msg


def coletar_status() -> dict:
    """Conecta na nuvem Tuya e devolve {codigo: valor} com todos os status do device."""
    api = TuyaOpenAPI(ENDPOINT, ACCESS_ID, ACCESS_SECRET)
    token = api.connect()
    if not token.get("success"):
        raise RuntimeError(_detalhar_erro(token, "Falha ao obter token na API Tuya"))

    resposta = api.get(f"/v1.0/iot-03/devices/{DEVICE_ID}/status")
    if not resposta.get("success"):
        raise RuntimeError(_detalhar_erro(resposta, "Falha ao consultar o device"))

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


def testar_endpoints() -> None:
    """Tenta obter o token em cada data center e mostra qual aceita as credenciais."""
    for nome, url in ENDPOINTS_CONHECIDOS.items():
        api = TuyaOpenAPI(url, ACCESS_ID, ACCESS_SECRET)
        try:
            token = api.connect()
        except Exception as exc:  # noqa: BLE001 - queremos seguir testando os demais
            print(f"[FALHA] {nome} ({url}): erro de conexão: {exc}")
            continue
        if token.get("success"):
            print(f"[OK]    {nome} ({url}): token obtido — use este endpoint!")
        else:
            print(f"[FALHA] {nome} ({url}): code={token.get('code')} - {token.get('msg')}")


def main() -> None:
    if "--testar-endpoints" in sys.argv:
        testar_endpoints()
        return

    leituras = coletar_status()
    if not leituras:
        print("Aviso: o device não retornou nenhum status.", file=sys.stderr)
        return
    gravar_csv(leituras)


if __name__ == "__main__":
    main()
