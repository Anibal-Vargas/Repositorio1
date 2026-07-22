"""Aplicativo desktop de relatórios de continuidade de aterramento (Nord Consult).

Lê o pacote .zip exportado pelo PWA e gera os documentos (planilha resumo,
laudo geral e laudos individuais).
"""

from .leitor import lerPacote, limparPacote
from .modelo import Cliente, Equipamento, Inspecao, Pacote

__all__ = [
    "lerPacote",
    "limparPacote",
    "Cliente",
    "Inspecao",
    "Equipamento",
    "Pacote",
]

VERSAO = "0.1.0"
