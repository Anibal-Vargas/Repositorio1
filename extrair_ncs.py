#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extrair_ncs.py — Extrai as Não Conformidades (NCs) de relatórios .docx de
inspeção elétrica anonimizados e consolida tudo em uma única planilha .xlsx.

Cada NC é lida como está (sem resumir/reescrever) para as colunas:
  arquivo_origem | secao | descricao_nc | itens_norma | solucao_proposta

COMO O SCRIPT RECONHECE UMA NC (heurística — ver "--diagnostico" abaixo)
-------------------------------------------------------------------------
Os relatórios não seguem um padrão único conhecido de antemão, então o
script tenta, nesta ordem, dois formatos comuns em laudos técnicos:

  FORMATO A — tabela com uma NC por LINHA: a primeira linha da tabela é um
  cabeçalho (ex.: "Não conformidade" | "Norma" | "Solução proposta") e cada
  linha seguinte é uma NC. As colunas são casadas por palavras-chave no
  cabeçalho (não pela posição), então variações como "Descrição da NC",
  "Referência normativa", "Ação corretiva proposta" também são reconhecidas.

  FORMATO B — tabela com uma NC por TABELA, em pares rótulo/valor (ex.: uma
  linha "Descrição da não conformidade" | texto, outra linha "Norma" |
  texto, outra "Solução proposta" | texto). Cada tabela desse tipo vira uma
  única NC.

  FALLBACK EM TEXTO CORRIDO — se um arquivo não tiver nenhuma tabela
  reconhecida nesses formatos, o script tenta um padrão em parágrafos:
  procura marcadores como "Não conformidade nº 1" / "NC 01" e, dentro de
  cada bloco até o próximo marcador, separa por rótulos de linha
  ("Descrição:", "Norma aplicável:", "Solução proposta:" etc.).

Em todos os formatos, a seção (alta/baixa tensão e tipo documental/
instalação/equipe) é herdada do último título/cabeçalho reconhecido ANTES
da NC no corpo do documento (por palavra-chave, não por estilo específico).

Como esses padrões foram definidos SEM ver os relatórios reais (ambiente
sem acesso às suas pastas locais), rode primeiro:

    py extrair_ncs.py --diagnostico

Isso imprime, para os 3 primeiros arquivos (ou os indicados em
--arquivos), a estrutura detectada — títulos de seção, tabelas encontradas
e como cada uma foi interpretada — SEM gerar a planilha. Confira se bate
com o conteúdo real antes de rodar a extração completa. Se não bater, me
mande um trecho do que apareceu (ou do relatório) que eu ajusto as
palavras-chave/padrões.

Uso (Windows):
    py extrair_ncs.py --diagnostico
    py extrair_ncs.py
    py extrair_ncs.py --entrada "C:\\Temp\\RNCs\\Anonimizados" --saida "C:\\Temp\\RNCs\\Planilhas\\Extracao_NCs_bruta.xlsx"

Requisitos: Python 3.8+, python-docx, openpyxl  (py -m pip install -r requirements.txt)
"""

import argparse
import os
import re
import sys
import unicodedata
from datetime import datetime

try:
    import docx
    from docx.oxml.ns import qn
    from docx.table import Table, _Cell
    from docx.text.paragraph import Paragraph
except ImportError:
    sys.exit("ERRO: python-docx não instalado. Execute:  py -m pip install python-docx")
try:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font
except ImportError:
    sys.exit("ERRO: openpyxl não instalado. Execute:  py -m pip install openpyxl")

# ----------------------------- Configuração ---------------------------------

PASTA_ENTRADA_PADRAO = r"C:\Temp\RNCs\Anonimizados"
ARQUIVO_SAIDA_PADRAO = r"C:\Temp\RNCs\Planilhas\Extracao_NCs_bruta.xlsx"

COLUNAS = ["arquivo_origem", "secao", "descricao_nc", "itens_norma", "solucao_proposta"]

# Palavras-chave (já normalizadas: minúsculas, sem acento) usadas para casar
# cabeçalhos de coluna / rótulos de campo com os 3 conteúdos de uma NC.
CHAVES_DESCRICAO = [
    "nao conformidade", "descricao da nc", "descricao", "constatacao",
    "nc identificada", "achado", "irregularidade",
]
CHAVES_NORMA = [
    "item da norma", "itens da norma", "referencia normativa", "base normativa",
    "norma aplicavel", "fundamentacao", "requisito normativo", "legislacao",
    "norma",
]
CHAVES_SOLUCAO = [
    "solucao proposta", "acao corretiva", "medida corretiva", "acao proposta",
    "recomendacao", "tratativa", "solucao",
]

# Palavras-chave para reconhecer a seção corrente (tensão / tipo) em títulos.
CHAVES_TENSAO = [
    ("alta tensao", "Alta Tensão"),
    ("baixa tensao", "Baixa Tensão"),
]
CHAVES_TIPO = [
    ("documental", "Documental"),
    ("instalacoes", "Instalação"),
    ("instalacao", "Instalação"),
    ("equipe", "Equipe"),
]

RE_INICIO_NC = re.compile(r"^\s*(nao conformidade|n\.?c\.?)\s*n?[o0ºª]?\s*[:\-.]?\s*\d*", re.IGNORECASE)

RE_ROTULOS = [
    ("descricao", re.compile(
        r"^\s*(descri[cç][aã]o( da (n[aã]o conformidade|nc))?|constata[cç][aã]o)\s*:\s*(.*)",
        re.IGNORECASE)),
    ("norma", re.compile(
        r"^\s*(item(?:ns)? da norma|refer[eê]ncia normativa|base normativa|"
        r"norma(?:s)? aplic[aá]vel|fundamenta[cç][aã]o|requisito normativo)\s*:\s*(.*)",
        re.IGNORECASE)),
    ("solucao", re.compile(
        r"^\s*(solu[cç][aã]o proposta|a[cç][aã]o corretiva( proposta)?|"
        r"medida corretiva|recomenda[cç][aã]o)\s*:\s*(.*)",
        re.IGNORECASE)),
]


def normalizar(texto):
    """minúsculas, sem acento — só para casar palavras-chave (nunca para saída)."""
    sem_acento = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii")
    return sem_acento.lower().strip()


def classificar_por_chaves(texto_normalizado, chaves):
    return any(chave in texto_normalizado for chave in chaves)


def campo_alvo(texto_normalizado):
    if classificar_por_chaves(texto_normalizado, CHAVES_DESCRICAO):
        return "descricao"
    if classificar_por_chaves(texto_normalizado, CHAVES_NORMA):
        return "norma"
    if classificar_por_chaves(texto_normalizado, CHAVES_SOLUCAO):
        return "solucao"
    return None


# ------------------------- Iteração do corpo do .docx ------------------------


def iter_blocos(parent):
    """Percorre parágrafos e tabelas na ORDEM em que aparecem no documento
    (python-docx não expõe isso diretamente; é a receita padrão para tal)."""
    if isinstance(parent, docx.document.Document):
        elemento_pai = parent.element.body
    elif isinstance(parent, _Cell):
        elemento_pai = parent._tc
    else:
        raise ValueError(f"tipo não suportado: {type(parent)}")
    for filho in elemento_pai.iterchildren():
        if filho.tag == qn("w:p"):
            yield Paragraph(filho, parent)
        elif filho.tag == qn("w:tbl"):
            yield Table(filho, parent)


# ------------------------------ Seção corrente --------------------------------


def parece_titulo(paragrafo):
    texto = paragrafo.text.strip()
    if not texto or len(texto) > 100:
        return False
    estilo = (paragrafo.style.name or "").lower() if paragrafo.style else ""
    if "heading" in estilo or "titulo" in normalizar(estilo):
        return True
    if texto.isupper() and len(texto) > 3:
        return True
    runs_com_texto = [r for r in paragrafo.runs if r.text.strip()]
    if runs_com_texto and all(r.bold for r in runs_com_texto):
        return True
    return False


def atualizar_secao(paragrafo, secao_atual):
    """Se o parágrafo parecer um título/rótulo de seção e contiver palavras-
    chave de tensão/tipo, atualiza e retorna a seção corrente (dict com
    'tensao' e 'tipo'); caso contrário devolve secao_atual sem alterar.

    Aceita tanto títulos formatados (estilo Heading, negrito, CAIXA ALTA)
    quanto rótulos curtos sem formatação especial (ex.: uma linha isolada
    "Documental"), desde que o parágrafo seja curto — para não confundir
    uma NC que apenas MENCIONE "instalação"/"documental" no meio do texto
    com um título de seção real."""
    texto = paragrafo.text.strip()
    curto = 0 < len(texto) <= 40
    if not (parece_titulo(paragrafo) or curto):
        return secao_atual
    texto_norm = normalizar(texto)
    nova = dict(secao_atual)
    encontrou = False
    for chave, rotulo in CHAVES_TENSAO:
        if chave in texto_norm:
            nova["tensao"] = rotulo
            encontrou = True
            break
    for chave, rotulo in CHAVES_TIPO:
        if chave in texto_norm:
            nova["tipo"] = rotulo
            encontrou = True
            break
    return nova if encontrou else secao_atual


def texto_secao(secao):
    partes = [p for p in (secao.get("tensao"), secao.get("tipo")) if p]
    return " - ".join(partes) if partes else ""


# --------------------------- Extração de tabelas ------------------------------


def extrair_tabela_formato_a(tabela):
    """Uma NC por linha; cabeçalho na 1ª linha. None se não reconhecer."""
    linhas = tabela.rows
    if len(linhas) < 2:
        return None
    mapeamento = {}
    for indice, celula in enumerate(linhas[0].cells):
        alvo = campo_alvo(normalizar(celula.text))
        if alvo and alvo not in mapeamento.values():
            mapeamento[indice] = alvo
    if "descricao" not in mapeamento.values():
        return None

    registros = []
    for linha in linhas[1:]:
        celulas = linha.cells
        campos = {"descricao": "", "norma": "", "solucao": ""}
        for indice, alvo in mapeamento.items():
            if indice < len(celulas):
                texto = celulas[indice].text.strip()
                if texto:
                    campos[alvo] = f"{campos[alvo]}\n{texto}".strip() if campos[alvo] else texto
        if campos["descricao"]:
            registros.append(campos)
    return registros or None


def extrair_tabela_formato_b(tabela):
    """Uma NC inteira por tabela, em pares rótulo (col. 0) / valor (col. 1+)."""
    campos = {"descricao": "", "norma": "", "solucao": ""}
    campos_encontrados = 0
    for linha in tabela.rows:
        celulas = linha.cells
        if len(celulas) < 2:
            continue
        alvo = campo_alvo(normalizar(celulas[0].text))
        if not alvo:
            continue
        valores = [c.text.strip() for c in celulas[1:] if c.text.strip()]
        # remove duplicatas de células mescladas (mesmo texto repetido no grid)
        valores_unicos = list(dict.fromkeys(valores))
        valor = "\n".join(valores_unicos)
        if valor:
            campos[alvo] = f"{campos[alvo]}\n{valor}".strip() if campos[alvo] else valor
            campos_encontrados += 1
    if campos_encontrados >= 2 and campos["descricao"]:
        return [campos]
    return None


def extrair_tabela(tabela):
    """Retorna (lista_de_registros, formato) ou (None, None) se a tabela não
    parecer conter NC (ex.: capa, sumário, tabela de índice).

    Tabelas de exatamente 2 colunas são ambíguas entre os dois formatos (a
    "coluna de valor" do formato B pode conter texto que bate por acaso com
    uma palavra-chave de outra categoria), então nesse caso o formato B
    -mais específico, pois exige >=2 rótulos batendo na coluna 0- é
    tentado primeiro."""
    duas_colunas = bool(tabela.rows) and len(tabela.rows[0].cells) == 2
    ordem = (extrair_tabela_formato_b, extrair_tabela_formato_a) if duas_colunas \
        else (extrair_tabela_formato_a, extrair_tabela_formato_b)
    nomes = {extrair_tabela_formato_a: "A (uma NC por linha)",
             extrair_tabela_formato_b: "B (uma NC por tabela, rótulo/valor)"}
    for funcao in ordem:
        registros = funcao(tabela)
        if registros:
            return registros, nomes[funcao]
    return None, None


# ------------------------ Fallback: parágrafos em texto -----------------------


def extrair_paragrafos_fallback(paragrafos_com_secao):
    """paragrafos_com_secao: lista de (texto, secao_dict) na ordem do doc.
    Usa marcadores 'Não conformidade nº N' / 'NC 01' para delimitar blocos e
    rótulos de linha para separar descrição/norma/solução dentro do bloco."""
    registros = []
    bloco_atual = None  # dict com campos + secao

    for texto, secao in paragrafos_com_secao:
        texto_norm = normalizar(texto)
        if RE_INICIO_NC.match(texto_norm):
            if bloco_atual and bloco_atual["descricao"]:
                registros.append(bloco_atual)
            bloco_atual = {"descricao": "", "norma": "", "solucao": "", "secao": secao,
                            "_ultimo_campo": "descricao"}
            continue
        if bloco_atual is None:
            continue

        casou = False
        for alvo, padrao in RE_ROTULOS:
            m = padrao.match(texto)
            if m:
                resto = m.group(m.lastindex).strip() if m.lastindex else ""
                bloco_atual[alvo] = f"{bloco_atual[alvo]}\n{resto}".strip() if bloco_atual[alvo] else resto
                bloco_atual["_ultimo_campo"] = alvo
                casou = True
                break
        if not casou:
            campo = bloco_atual["_ultimo_campo"]
            bloco_atual[campo] = f"{bloco_atual[campo]}\n{texto}".strip() if bloco_atual[campo] else texto

    if bloco_atual and bloco_atual["descricao"]:
        registros.append(bloco_atual)
    for r in registros:
        r.pop("_ultimo_campo", None)
    return registros


# --------------------------------- Por arquivo --------------------------------


def processar_arquivo(caminho):
    """Retorna (lista_de_registros, diagnostico_linhas).

    Cada registro: {"secao": str, "descricao": str, "norma": str, "solucao": str}
    """
    documento = docx.Document(caminho)
    secao_atual = {"tensao": None, "tipo": None}
    registros = []
    paragrafos_fora_de_tabela = []  # para o fallback
    diagnostico = []
    n_tabelas = 0
    n_tabelas_reconhecidas = 0

    for bloco in iter_blocos(documento):
        if isinstance(bloco, Paragraph):
            secao_antes = texto_secao(secao_atual)
            secao_atual = atualizar_secao(bloco, secao_atual)
            if texto_secao(secao_atual) != secao_antes:
                diagnostico.append(f"  [título de seção] \"{bloco.text.strip()[:80]}\" "
                                    f"-> seção corrente: \"{texto_secao(secao_atual)}\"")
            if bloco.text.strip():
                paragrafos_fora_de_tabela.append((bloco.text, dict(secao_atual)))
        elif isinstance(bloco, Table):
            n_tabelas += 1
            registros_tabela, formato = extrair_tabela(bloco)
            if registros_tabela:
                n_tabelas_reconhecidas += 1
                diagnostico.append(
                    f"  [tabela {n_tabelas}] formato {formato} -> {len(registros_tabela)} NC(s) "
                    f"| seção: \"{texto_secao(secao_atual)}\"")
                for reg in registros_tabela:
                    registros.append({
                        "secao": texto_secao(secao_atual),
                        "descricao": reg["descricao"],
                        "norma": reg["norma"],
                        "solucao": reg["solucao"],
                    })
            else:
                cabecalho = bloco.rows[0].cells[0].text.strip()[:50] if bloco.rows else "(vazia)"
                diagnostico.append(
                    f"  [tabela {n_tabelas}] não reconhecida como NC (1ª célula: \"{cabecalho}\") — ignorada")

    metodo = "tabela"
    if not registros:
        registros_fallback = extrair_paragrafos_fallback(paragrafos_fora_de_tabela)
        if registros_fallback:
            metodo = "fallback em parágrafos"
            diagnostico.append(f"  [fallback] nenhuma NC via tabela — "
                                f"{len(registros_fallback)} NC(s) via marcadores em texto corrido")
            for reg in registros_fallback:
                registros.append({
                    "secao": texto_secao(reg["secao"]),
                    "descricao": reg["descricao"],
                    "norma": reg["norma"],
                    "solucao": reg["solucao"],
                })

    diagnostico.insert(0, f"  Tabelas no documento: {n_tabelas} | reconhecidas como NC: "
                          f"{n_tabelas_reconhecidas} | método usado: {metodo if registros else 'nenhum — 0 NCs'}")
    return registros, diagnostico


# --------------------------------- Diagnóstico --------------------------------


def executar_diagnostico(pasta_entrada, nomes_arquivos):
    print("=" * 78)
    print("MODO DIAGNÓSTICO — nenhuma planilha será gerada.")
    print("Confira abaixo se a estrutura detectada bate com o conteúdo real dos")
    print("arquivos antes de rodar a extração completa (sem --diagnostico).")
    print("=" * 78)
    for nome in nomes_arquivos:
        caminho = os.path.join(pasta_entrada, nome)
        print(f"\nARQUIVO: {nome}")
        try:
            registros, diagnostico = processar_arquivo(caminho)
        except Exception as exc:
            print(f"  *** ERRO ao abrir/processar: {exc}")
            continue
        for linha in diagnostico:
            print(linha)
        if registros:
            primeira = registros[0]
            print("  Exemplo da 1ª NC extraída:")
            print(f"    secao: {primeira['secao'] or '(não identificada)'}")
            print(f"    descricao_nc: {primeira['descricao'][:200]!r}")
            print(f"    itens_norma: {primeira['norma'][:200]!r}")
            print(f"    solucao_proposta: {primeira['solucao'][:200]!r}")
        else:
            print("  *** NENHUMA NC reconhecida neste arquivo — revisar padrões.")


# --------------------------------- Pipeline ----------------------------------


def executar(pasta_entrada, arquivo_saida):
    if not os.path.isdir(pasta_entrada):
        sys.exit(f"ERRO: pasta de entrada não existe: {pasta_entrada}")
    os.makedirs(os.path.dirname(arquivo_saida) or ".", exist_ok=True)

    arquivos = sorted(
        f for f in os.listdir(pasta_entrada)
        if f.lower().endswith(".docx") and not f.startswith("~$")
    )
    if not arquivos:
        sys.exit(f"Nenhum .docx encontrado em {pasta_entrada}")

    pasta_saida = os.path.dirname(arquivo_saida) or "."
    caminho_log = os.path.join(pasta_saida, "log_extracao_ncs.txt")
    linhas_log = [
        "LOG DE EXTRAÇÃO DE NCs — " + datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        f"Entrada: {pasta_entrada}",
        f"Saída:   {arquivo_saida}",
        "=" * 78,
    ]

    linhas_planilha = []  # cada item: dict com as COLUNAS
    contagem_por_arquivo = []
    arquivos_sem_nc = []

    for indice, nome_arquivo in enumerate(arquivos, 1):
        caminho = os.path.join(pasta_entrada, nome_arquivo)
        print(f"[{indice}/{len(arquivos)}] {nome_arquivo} ...", flush=True)
        linhas_log.append(f"\nARQUIVO: {nome_arquivo}")
        try:
            registros, diagnostico = processar_arquivo(caminho)
        except Exception as exc:
            linhas_log.append(f"  *** ERRO ao processar: {exc}")
            print(f"    ERRO: {exc}")
            contagem_por_arquivo.append((nome_arquivo, 0))
            arquivos_sem_nc.append(f"{nome_arquivo} (erro: {exc})")
            continue

        linhas_log.extend(diagnostico)
        for reg in registros:
            linhas_planilha.append({
                "arquivo_origem": nome_arquivo,
                "secao": reg["secao"],
                "descricao_nc": reg["descricao"],
                "itens_norma": reg["norma"],
                "solucao_proposta": reg["solucao"],
            })
        contagem_por_arquivo.append((nome_arquivo, len(registros)))
        if not registros:
            arquivos_sem_nc.append(nome_arquivo)
        print(f"    {len(registros)} NC(s) extraída(s)")

    # ------------------------------ Planilha ---------------------------------
    livro = Workbook()
    aba = livro.active
    aba.title = "NCs"
    aba.append(COLUNAS)
    for celula in aba[1]:
        celula.font = Font(bold=True)
    for linha in linhas_planilha:
        aba.append([linha[c] for c in COLUNAS])
    for col in aba.columns:
        letra = col[0].column_letter
        largura = 60 if letra in ("C", "D", "E") else 30
        aba.column_dimensions[letra].width = largura
    for linha in aba.iter_rows(min_row=2):
        for celula in linha:
            celula.alignment = Alignment(wrap_text=True, vertical="top")
    aba.freeze_panes = "A2"
    livro.save(arquivo_saida)

    # ------------------------------ Resumo geral -----------------------------
    total = len(linhas_planilha)
    resumo = [
        "",
        "=" * 78,
        "RESUMO GERAL",
        f"  Arquivos processados: {len(arquivos)}",
        f"  Total de NCs extraídas: {total}",
        "  Por arquivo:",
    ]
    for nome, qtd in contagem_por_arquivo:
        resumo.append(f"    - {nome}: {qtd}")
    if arquivos_sem_nc:
        resumo.append(f"\n  ATENÇÃO: {len(arquivos_sem_nc)} arquivo(s) sem nenhuma NC extraída "
                       "(revisar manualmente):")
        for nome in arquivos_sem_nc:
            resumo.append(f"    - {nome}")
    else:
        resumo.append("\n  Todos os arquivos tiveram ao menos uma NC extraída.")

    linhas_log.extend(resumo)
    with open(caminho_log, "w", encoding="utf-8") as arquivo_log:
        arquivo_log.write("\n".join(linhas_log) + "\n")
    print("\n".join(resumo))
    print(f"\nPlanilha gerada: {arquivo_saida}")
    print(f"Log detalhado:   {caminho_log}")


def main():
    parser = argparse.ArgumentParser(
        description="Extrai não conformidades (NCs) de relatórios .docx de inspeção "
                    "elétrica para uma planilha .xlsx única.")
    parser.add_argument("--entrada", default=PASTA_ENTRADA_PADRAO,
                        help=f"pasta com os relatórios .docx anonimizados (padrão: {PASTA_ENTRADA_PADRAO})")
    parser.add_argument("--saida", default=ARQUIVO_SAIDA_PADRAO,
                        help=f"arquivo .xlsx de saída (padrão: {ARQUIVO_SAIDA_PADRAO})")
    parser.add_argument("--diagnostico", action="store_true",
                        help="não gera planilha; apenas mostra a estrutura detectada em "
                             "alguns arquivos, para validar os padrões de extração")
    parser.add_argument("--arquivos", nargs="+", default=None,
                        help="nomes de arquivo específicos para --diagnostico "
                             "(padrão: os 3 primeiros da pasta, em ordem alfabética)")
    argumentos = parser.parse_args()

    if argumentos.diagnostico:
        if not os.path.isdir(argumentos.entrada):
            sys.exit(f"ERRO: pasta de entrada não existe: {argumentos.entrada}")
        if argumentos.arquivos:
            nomes = argumentos.arquivos
        else:
            todos = sorted(
                f for f in os.listdir(argumentos.entrada)
                if f.lower().endswith(".docx") and not f.startswith("~$")
            )
            nomes = todos[:3]
        if not nomes:
            sys.exit(f"Nenhum .docx encontrado em {argumentos.entrada}")
        executar_diagnostico(argumentos.entrada, nomes)
    else:
        executar(argumentos.entrada, argumentos.saida)


if __name__ == "__main__":
    main()
