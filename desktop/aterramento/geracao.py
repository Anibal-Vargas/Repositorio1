"""Orquestração da geração dos documentos de uma inspeção.

Reúne planilha resumo + laudo geral + laudos individuais numa pasta de saída
escolhida pelo operador. Camada sem interface (testável), usada pela tela.
"""

from __future__ import annotations

import os
import re

from .configuracao import Configuracao
from .laudos import gerarLaudoGeral, gerarLaudosIndividuais
from .modelo import Pacote
from .pdf import converter_para_pdf
from .planilha import gerarPlanilhaResumo


def _seguro(texto: str) -> str:
    """Nome de arquivo/pasta seguro para Windows."""
    texto = re.sub(r'[\\/:*?"<>|]', "-", texto).strip()
    return re.sub(r"\s+", " ", texto) or "sem-nome"


def gerar_todos(
    pacote: Pacote,
    config: Configuracao,
    data_medicoes,
    medicoes: dict,
    pasta_base: str,
    *,
    local: str | None = None,
    criar_subpasta: bool = True,
    gerar_planilha: bool = True,
    gerar_geral: bool = True,
    gerar_individuais: bool = True,
    gerar_pdf: bool = False,
) -> dict:
    """Gera os documentos da inspeção em ``pasta_base``.

    ``medicoes``: ``{chave_equipamento: {"valor": float, "prolongador": float|None}}``
    (``chave`` = :pyattr:`Equipamento.chave`). Devolve um dicionário com a pasta
    e os caminhos gerados.
    """
    cliente = pacote.cliente.nome or "Cliente"
    data_str = data_medicoes.strftime("%Y-%m-%d")

    pasta = pasta_base
    if criar_subpasta:
        pasta = os.path.join(pasta_base, _seguro(f"{cliente} - {data_str}"))
    os.makedirs(pasta, exist_ok=True)

    resultado = {"pasta": pasta, "planilha": None, "geral": None,
                 "individuais": [], "pdfs": []}
    base_nome = _seguro(f"{cliente} - {data_str}")

    if gerar_planilha:
        resultado["planilha"] = gerarPlanilhaResumo(
            pacote,
            os.path.join(pasta, f"Planilha Resumo - {base_nome}.xlsx"),
            local=local,
            medicoes=medicoes,
            prolongador_padrao=config.prolongador_padrao,
            logo_cliente=(config.logo_cliente or None),
        )

    if gerar_geral:
        nome_planilha = (os.path.basename(resultado["planilha"])
                         if resultado["planilha"] else None)
        resultado["geral"] = gerarLaudoGeral(
            pacote,
            config,
            data_medicoes,
            os.path.join(pasta, f"Laudo Geral - {base_nome}.docx"),
            nome_planilha=nome_planilha,
        )

    if gerar_individuais:
        resultado["individuais"] = gerarLaudosIndividuais(
            pacote,
            config,
            data_medicoes,
            medicoes,
            os.path.join(pasta, "Laudos Individuais"),
        )

    if gerar_pdf:
        docs = [resultado["planilha"], resultado["geral"], *resultado["individuais"]]
        for doc in docs:
            if doc:
                pdf = converter_para_pdf(doc)
                if pdf:
                    resultado["pdfs"].append(pdf)

    return resultado
