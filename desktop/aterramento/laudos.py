"""Etapas 3 e 4 — Laudos (.docx) preenchendo os modelos do cliente.

Estratégia: usar os modelos ``Laudo_Geral_Padrao.docx`` e
``Laudo_Individual_Padrao.docx`` como base (preservando figuras, metodologia,
normas e formatação) e substituir apenas os campos variáveis. A substituição é
feita de forma robusta, mesmo quando o texto está dividido em vários "runs"
do Word, preservando a formatação ao redor.

Os dados fixos vêm da :class:`Configuracao` (preenchida uma vez); a data das
medições e os dados por máquina vêm da inspeção.
"""

from __future__ import annotations

import os

import docx

from .configuracao import Configuracao
from .modelo import Equipamento, Pacote

MODELO_GERAL = os.path.join(
    os.path.dirname(__file__), "..", "modelos", "Laudo_Geral_Padrao.docx"
)
MODELO_INDIVIDUAL = os.path.join(
    os.path.dirname(__file__), "..", "modelos", "Laudo_Individual_Padrao.docx"
)

_MESES = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]


def data_por_extenso(dt) -> str:
    return f"{dt.day:02d} de {_MESES[dt.month - 1]} de {dt.year}"


def _fmt(valor: float) -> str:
    """Formata número em pt-BR sem casas desnecessárias (57.4 -> '57,4')."""
    texto = f"{valor:.1f}".rstrip("0").rstrip(".")
    return texto.replace(".", ",")


# --- Substituição robusta de texto (atravessa runs) ----------------------

def _substituir_no_paragrafo(paragrafo, antigo: str, novo: str) -> bool:
    """Substitui a primeira ocorrência de ``antigo`` por ``novo`` no parágrafo,
    mesmo que o texto esteja dividido entre vários runs. Preserva a formatação
    do run onde a correspondência começa. Devolve True se substituiu."""
    runs = paragrafo.runs
    if not runs:
        return False
    texto = "".join(r.text for r in runs)
    inicio = texto.find(antigo)
    if inicio == -1:
        return False
    fim = inicio + len(antigo)

    pos = 0
    inserido = False
    for r in runs:
        ini_r, fim_r = pos, pos + len(r.text)
        pos = fim_r
        if fim_r <= inicio or ini_r >= fim:
            continue  # run sem sobreposição com o trecho
        ls = max(inicio, ini_r) - ini_r
        le = min(fim, fim_r) - ini_r
        antes, depois = r.text[:ls], r.text[le:]
        if not inserido:
            r.text = antes + novo + depois
            inserido = True
        else:
            r.text = antes + depois
    return True


def _iter_paragrafos(doc):
    yield from doc.paragraphs
    for tabela in doc.tables:
        for linha in tabela.rows:
            for celula in linha.cells:
                yield from celula.paragraphs
    for secao in doc.sections:
        for cab in (secao.header, secao.footer):
            yield from cab.paragraphs


def _aplicar_substituicoes(doc, substituicoes: dict) -> None:
    # Ordena por comprimento decrescente para evitar substituir trechos menores
    # antes dos maiores que os contêm.
    itens = sorted(substituicoes.items(), key=lambda kv: -len(kv[0]))
    for paragrafo in _iter_paragrafos(doc):
        for antigo, novo in itens:
            if antigo and antigo != novo:
                _substituir_no_paragrafo(paragrafo, antigo, str(novo))


# --- Laudo Geral ----------------------------------------------------------

def gerarLaudoGeral(
    pacote: Pacote,
    config: Configuracao,
    data_medicoes,
    caminho_saida: str,
    modelo: str | None = None,
) -> str:
    """Gera o laudo geral (.docx) preenchendo o modelo.

    ``data_medicoes`` é um ``datetime.date`` (ou date-like) da inspeção.
    """
    doc = docx.Document(modelo or MODELO_GERAL)
    data_curta = f"{data_medicoes.day:02d}/{data_medicoes.month:02d}/{data_medicoes.year}"
    data_ext = data_por_extenso(data_medicoes)

    subs = {
        # Contratante (seção 3)
        "Cooperativa Central Oeste Catarinense - Incubatório": config.contratante_nome,
        "RS - Rua Virgínio Basso, 13 - Ibiaçá, RS": config.contratante_endereco,
        "Cep: RS, 99940-000": f"Cep: {config.contratante_cep}",
        "Fone: (54) 9 144-5768": f"Fone: {config.contratante_fone}",
        "E-mail: daiane-almeida@auroracoop.com.br": f"E-mail: {config.contratante_email}",
        "CNPJ: 83.310.441/0099-20": f"CNPJ: {config.contratante_cnpj}",
        # Objetivos (descrição do contratante no texto)
        "Aurora, unidade Incubatório – Ibiaçá – Rs": config.contratante_descricao,
        # Engenheiro
        "Aníbal Rosa Vargas": config.engenheiro,
        "CREA-SC – 069788-5": f"CREA-SC – {config.crea}",
        # Proposta e capa
        "018PC26AUR": config.proposta,
        "COOPERATIVA CENTRAL AURORA ALIMENTOS": config.capa_linha_razao,
        "UNIDADE CATARINENSE – INCUBATÓRIO": config.capa_linha_unidade,
        "IBIACÁ - RS": config.capa_linha_local,
        "Chapecó - SC, 09 de março de 2026": f"{config.cidade}, {data_ext}",
        # Datas das medições
        "09/03/2026": data_curta,
    }
    _aplicar_substituicoes(doc, subs)

    os.makedirs(os.path.dirname(os.path.abspath(caminho_saida)), exist_ok=True)
    doc.save(caminho_saida)
    return caminho_saida
