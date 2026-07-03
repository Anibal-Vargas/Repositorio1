#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
anonimizar_relatorios.py — Anonimiza relatórios técnicos de inspeção elétrica
(.docx e .pdf) para uso em processo de padronização.

O que faz
---------
Para cada .docx da pasta de entrada:
  1. Substitui, em todo o texto (corpo, tabelas, cabeçalhos, rodapés, notas de
     rodapé/fim e comentários), ocorrências de:
       - CNPJ                              -> [CNPJ]
       - e-mail                            -> [EMAIL]
       - telefone                          -> [TELEFONE]
       - endereço (rua/av./CEP)            -> [ENDERECO]
       - nome de pessoa (campos rotulados) -> [PESSOA]
       - empresa / razão social            -> [CLIENTE]
  2. Remove todas as imagens do documento (word/media) e as referências a
     elas no XML (não apenas "escondidas": os bytes das fotos são retirados
     do arquivo).
  3. Salva a cópia anonimizada na pasta de saída com o mesmo nome + "_anon.docx".

Para cada .pdf da pasta de entrada:
  1. Extrai somente o texto (pypdf/pdfplumber).
  2. Aplica a mesma anonimização de texto.
  3. Salva como .txt na pasta de saída com o mesmo nome + "_anon.txt".

Regra de ouro: o ORIGINAL nunca é alterado (aberto somente para leitura) e,
diferente dos scripts de redução deste repositório, um arquivo que não possa
ser processado (corrompido ou protegido por senha) é PULADO — nunca é copiado
"como está" para a pasta de saída, pois isso vazaria dados não anonimizados
para o local que deveria conter apenas cópias anonimizadas. A falha é sempre
registrada no log.

Limitações importantes (a revisar por amostragem)
--------------------------------------------------
Detecção de CNPJ, e-mail, telefone e endereço é feita por padrões (regex) e
tende a ser confiável. Já nomes de PESSOA e de EMPRESA/razão social são
identificados de forma heurística:
  - por rótulos comuns em relatórios de inspeção/RNC (ex.: "Responsável:",
    "Técnico Responsável:", "Inspetor:", "Cliente:", "Razão Social:",
    "Contratante:", "Contratada:", "Elaborado por:", "Assinado por:" etc.);
  - por sufixo de razão social em texto livre (ex.: "... Indústria Ltda.",
    "... Comércio EIRELI", "... S.A.").
Nomes de pessoa ou empresa mencionados em texto corrido, sem rótulo e sem
sufixo de razão social, NÃO são detectados por não haver um modelo de NER no
ambiente. Por isso o log lista as contagens por tipo e por arquivo, para
revisão por amostragem antes de usar os relatórios no processo de
padronização.

Uso (Windows):
    py anonimizar_relatorios.py
    py anonimizar_relatorios.py --entrada "C:\\Temp\\RNCs\\Compactados" --saida "C:\\Temp\\RNCs\\Anonimizados"

Requisitos: Python 3.8+, python-docx, pypdf, pdfplumber
    py -m pip install -r requirements.txt
"""

import argparse
import os
import re
import sys
import traceback
import zipfile
from collections import Counter
from datetime import datetime

try:
    import docx  # python-docx
    from docx.oxml.ns import qn
except ImportError:
    sys.exit("ERRO: python-docx não instalado. Execute:  py -m pip install python-docx")

try:
    import pypdf
    PYPDF_DISPONIVEL = True
except ImportError:
    PYPDF_DISPONIVEL = False

try:
    import pdfplumber
    PDFPLUMBER_DISPONIVEL = True
except ImportError:
    PDFPLUMBER_DISPONIVEL = False

# ----------------------------- Configuração ---------------------------------

PASTA_ENTRADA_PADRAO = r"C:\Temp\RNCs\Compactados"
PASTA_SAIDA_PADRAO = r"C:\Temp\RNCs\Anonimizados"

TIPO_REL_IMAGEM = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS_ALTERNATE_CONTENT = "http://schemas.openxmlformats.org/markup-compatibility/2006"
TAG_ALTERNATE_CONTENT = f"{{{NS_ALTERNATE_CONTENT}}}AlternateContent"
XML_SPACE_ATTR = "{http://www.w3.org/XML/1998/namespace}space"

CATEGORIAS = ["CLIENTE", "CNPJ", "ENDERECO", "PESSOA", "EMAIL", "TELEFONE"]

# --------------------------- Padrões de anonimização --------------------------

RE_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")

RE_CNPJ = re.compile(r"\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b")

RE_TELEFONE_ROTULADO = re.compile(
    r"(?P<rotulo>Tel(?:efones?)?|Fones?|Cel(?:ular)?|WhatsApp|Contato)"
    r"(?P<separador>\s*[:\-]?\s*)"
    r"(?P<valor>(?:\+?55\s?)?\(?\d{2}\)?[\s.\-]?\d{4,5}[\s.\-]?\d{4})",
    re.IGNORECASE,
)
RE_TELEFONE_FORMATADO = re.compile(r"\(?\d{2}\)?[\s.\-]\d{4,5}-\d{4}\b")
RE_TELEFONE_0800 = re.compile(r"\b0800[\s.\-]?\d{3}[\s.\-]?\d{4}\b")

RE_ENDERECO = re.compile(
    r"\b(?:Rua|Av\.?|Avenida|Alameda|Al\.?|Travessa|Rodovia|Rod\.?|Estrada|"
    r"Pra[cç]a|Pça\.?|Quadra|Qd\.?)\b[^\n;]*(?:,[^\n;]*){0,4}(?:\d{5}-?\d{3})?",
    re.IGNORECASE,
)
RE_CEP_ROTULADO = re.compile(r"\bCEP\s*n?[ºo°]?\s*[:.]?\s*\d{5}-?\d{3}\b", re.IGNORECASE)

RE_CAMPO_PESSOA = re.compile(
    r"(?P<rotulo>Respons[aá]vel(?:\s+T[eé]cnico)?|T[eé]cnico\s+Respons[aá]vel|"
    r"Inspetor(?:\(a\))?|Contato|Elaborado\s+por|Aprovado\s+por|Emitido\s+por|"
    r"Assinado(?:\s+eletronicamente)?\s+por|Nome\s+do\s+Respons[aá]vel|"
    r"Nome\s+do\s+Inspetor)"
    r"(?P<separador>\s*[:\-]\s*)"
    r"(?P<valor>[^\n,;]{2,80})",
    re.IGNORECASE,
)

RE_CAMPO_EMPRESA = re.compile(
    r"(?P<rotulo>Raz[aã]o\s+Social|Cliente|Contratante|Contratada|Empresa|"
    r"Fornecedor|Nome\s+Fantasia|Fantasia)"
    r"(?P<separador>\s*[:\-]\s*)"
    r"(?P<valor>[^\n,;]{2,120})",
    re.IGNORECASE,
)

# Placeholder já colocado por uma categoria anterior nesta mesma passada
# (ex.: "Contato: [EMAIL]") — se o valor capturado por um campo rotulado for
# só isso (com espaços em volta), não deve ser "recapturado" como outra
# categoria.
RE_JA_E_PLACEHOLDER = re.compile(
    r"^\s*\[(?:CLIENTE|CNPJ|ENDERECO|PESSOA|EMAIL|TELEFONE)\]\s*$")

RE_EMPRESA_SUFIXO = re.compile(
    r"\b[A-ZÀ-Ý][\wÀ-ÿ.&\-]*(?:\s+(?:[A-ZÀ-Ý][\wÀ-ÿ.&\-]*|e|de|da|do|das|dos))*"
    r"\s+(?:LTDA\.?|EIRELI|S\.?\/?A\.?|ME|EPP|CIA\.?)(?![A-Za-zÀ-ÿ0-9])"
)


def _substituir_rotulado(padrao, texto, categoria, placeholder, contagens):
    def repl(m):
        if RE_JA_E_PLACEHOLDER.match(m.group("valor")):
            return m.group(0)  # valor já é um placeholder de outra categoria
        contagens[categoria] += 1
        return m.group("rotulo") + m.group("separador") + placeholder

    return padrao.sub(repl, texto)


def _substituir_simples(padrao, texto, categoria, placeholder, contagens):
    def repl(_m):
        contagens[categoria] += 1
        return placeholder

    return padrao.sub(repl, texto)


def anonimizar_texto(texto):
    """Aplica todas as substituições de anonimização em `texto`.

    Retorna (novo_texto, contagens) onde contagens é um Counter por categoria.
    A ordem importa: padrões mais específicos (e-mail, CNPJ, telefone,
    endereço) são aplicados antes dos heurísticos de nome/empresa, para que
    um CNPJ ou telefone dentro de um campo "Cliente: ..." já esteja
    substituído quando o rótulo de empresa for processado.
    """
    if not texto:
        return texto, Counter()

    contagens = Counter()
    texto = _substituir_simples(RE_EMAIL, texto, "EMAIL", "[EMAIL]", contagens)
    texto = _substituir_simples(RE_CNPJ, texto, "CNPJ", "[CNPJ]", contagens)
    texto = _substituir_rotulado(
        RE_TELEFONE_ROTULADO, texto, "TELEFONE", "[TELEFONE]", contagens)
    texto = _substituir_simples(
        RE_TELEFONE_0800, texto, "TELEFONE", "[TELEFONE]", contagens)
    texto = _substituir_simples(
        RE_TELEFONE_FORMATADO, texto, "TELEFONE", "[TELEFONE]", contagens)
    texto = _substituir_simples(RE_ENDERECO, texto, "ENDERECO", "[ENDERECO]", contagens)
    texto = _substituir_simples(
        RE_CEP_ROTULADO, texto, "ENDERECO", "[ENDERECO]", contagens)
    texto = _substituir_rotulado(
        RE_CAMPO_PESSOA, texto, "PESSOA", "[PESSOA]", contagens)
    texto = _substituir_rotulado(
        RE_CAMPO_EMPRESA, texto, "CLIENTE", "[CLIENTE]", contagens)
    texto = _substituir_simples(
        RE_EMPRESA_SUFIXO, texto, "CLIENTE", "[CLIENTE]", contagens)
    return texto, contagens


# ------------------------------ Processamento .docx --------------------------


def _nos_texto(elemento_paragrafo):
    return list(elemento_paragrafo.iter(qn("w:t")))


def _texto_paragrafo(elemento_paragrafo):
    return "".join(no.text or "" for no in _nos_texto(elemento_paragrafo))


def _definir_texto_paragrafo(elemento_paragrafo, novo_texto):
    nos = _nos_texto(elemento_paragrafo)
    if not nos:
        return
    nos[0].text = novo_texto
    nos[0].set(XML_SPACE_ATTR, "preserve")
    for no in nos[1:]:
        no.text = ""


def _partes_com_texto(document):
    """Todas as partes XML do pacote que podem conter parágrafos de texto
    (corpo, tabelas, cabeçalhos, rodapés, notas de rodapé/fim, comentários)."""
    partes = []
    for part in document.part.package.iter_parts():
        nome = str(part.partname)
        if not nome.endswith(".xml"):
            continue
        if not any(
            chave in nome
            for chave in ("document.xml", "header", "footer", "footnotes.xml",
                          "endnotes.xml", "comments.xml")
        ):
            continue
        elemento = getattr(part, "element", None)
        if elemento is not None:
            partes.append(elemento)
    return partes


def anonimizar_docx_em_memoria(document):
    """Substitui texto sensível em todas as partes do documento (já aberto
    com python-docx). Retorna Counter agregado de substituições."""
    contagens_totais = Counter()
    for elemento_parte in _partes_com_texto(document):
        for elemento_p in elemento_parte.iter(qn("w:p")):
            texto_original = _texto_paragrafo(elemento_p)
            if not texto_original:
                continue
            novo_texto, contagens = anonimizar_texto(texto_original)
            if contagens:
                _definir_texto_paragrafo(elemento_p, novo_texto)
                contagens_totais.update(contagens)
    return contagens_totais


def remover_imagens_em_memoria(document):
    """Remove todos os elementos de imagem (w:drawing / w:pict, inclusive
    dentro de mc:AlternateContent) de todas as partes de texto. Retorna o
    número de "slots" de imagem removidos."""
    removidas = 0
    for elemento_parte in _partes_com_texto(document):
        for alt in list(elemento_parte.iter(TAG_ALTERNATE_CONTENT)):
            pai = alt.getparent()
            if pai is not None:
                pai.remove(alt)
                removidas += 1
        for tag in (qn("w:drawing"), qn("w:pict")):
            for elemento in list(elemento_parte.iter(tag)):
                pai = elemento.getparent()
                if pai is not None:
                    pai.remove(elemento)
                    removidas += 1
    return removidas


def _remover_media_do_zip(caminho_entrada, caminho_saida):
    """Reabre um .docx já salvo, removendo as partes word/media/* (bytes das
    imagens) e as relações do tipo imagem nos arquivos .rels correspondentes.
    """
    import lxml.etree as ET

    with zipfile.ZipFile(caminho_entrada, "r") as zin:
        itens = zin.infolist()
        dados = {item.filename: zin.read(item.filename) for item in itens}

    with zipfile.ZipFile(caminho_saida, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in itens:
            nome = item.filename
            if nome.replace("\\", "/").lower().startswith("word/media/"):
                continue  # descarta os bytes da imagem
            conteudo = dados[nome]
            if nome.endswith(".rels"):
                root = ET.fromstring(conteudo)
                alterado = False
                for rel in list(root.findall(f"{{{NS_REL}}}Relationship")):
                    if rel.get("Type") == TIPO_REL_IMAGEM:
                        root.remove(rel)
                        alterado = True
                if alterado:
                    conteudo = ET.tostring(
                        root, xml_declaration=True, encoding="UTF-8", standalone=True)
            novo_info = zipfile.ZipInfo(filename=nome, date_time=item.date_time)
            novo_info.compress_type = zipfile.ZIP_DEFLATED
            novo_info.external_attr = item.external_attr
            novo_info.create_system = item.create_system
            zout.writestr(novo_info, conteudo)


def processar_docx(origem, destino):
    """Gera `destino` a partir de `origem`: texto anonimizado e imagens
    removidas. Lê a origem SOMENTE para leitura. Levanta exceção em caso de
    arquivo corrompido/protegido — cabe ao chamador decidir pular e logar."""
    document = docx.Document(origem)
    contagens = anonimizar_docx_em_memoria(document)
    imagens_removidas = remover_imagens_em_memoria(document)

    destino_tmp1 = destino + ".tmp1"
    destino_tmp2 = destino + ".tmp2"
    try:
        document.save(destino_tmp1)
        _remover_media_do_zip(destino_tmp1, destino_tmp2)

        # Validação: o arquivo gerado precisa abrir sem erros e não pode
        # sobrar nenhuma imagem.
        verificacao = docx.Document(destino_tmp2)
        if len(verificacao.inline_shapes) != 0:
            raise ValueError(
                f"ainda restam {len(verificacao.inline_shapes)} imagem(ns) inline após a remoção")

        os.replace(destino_tmp2, destino)
    finally:
        for tmp in (destino_tmp1, destino_tmp2):
            if os.path.exists(tmp):
                os.remove(tmp)

    return contagens, imagens_removidas


# ------------------------------- Processamento .pdf ---------------------------


def extrair_texto_pdf(caminho):
    """Retorna (texto, None) em caso de sucesso ou (None, motivo) quando o
    arquivo deve ser pulado (corrompido, protegido ou sem texto extraível)."""
    if PYPDF_DISPONIVEL:
        try:
            leitor = pypdf.PdfReader(caminho)
            if leitor.is_encrypted:
                try:
                    resultado = leitor.decrypt("")
                except Exception:
                    resultado = 0
                if not resultado:
                    return None, "protegido por senha"
        except Exception as exc:
            return None, f"não foi possível abrir o PDF ({exc})"

    if not PDFPLUMBER_DISPONIVEL:
        return None, "biblioteca pdfplumber não instalada"

    try:
        paginas_texto = []
        with pdfplumber.open(caminho) as pdf:
            for pagina in pdf.pages:
                paginas_texto.append(pagina.extract_text() or "")
        texto = "\n".join(paginas_texto)
    except Exception as exc:
        return None, f"arquivo corrompido ou ilegível ({exc})"

    if not texto.strip():
        return None, "nenhum texto extraível (PDF provavelmente digitalizado/sem camada de texto)"
    return texto, None


def processar_pdf(origem, destino_txt):
    texto, motivo = extrair_texto_pdf(origem)
    if texto is None:
        return None, None, motivo
    novo_texto, contagens = anonimizar_texto(texto)
    with open(destino_txt, "w", encoding="utf-8") as arquivo:
        arquivo.write(novo_texto)
    return contagens, True, None


# --------------------------------- Pipeline ----------------------------------


def _formatar_contagens(contagens):
    partes = [f"{cat}: {contagens.get(cat, 0)}" for cat in CATEGORIAS if contagens.get(cat, 0)]
    return ", ".join(partes) if partes else "nenhuma substituição"


def executar(pasta_entrada, pasta_saida):
    if not os.path.isdir(pasta_entrada):
        sys.exit(f"ERRO: pasta de entrada não existe: {pasta_entrada}")
    os.makedirs(pasta_saida, exist_ok=True)

    arquivos = sorted(
        f for f in os.listdir(pasta_entrada)
        if f.lower().endswith((".docx", ".pdf")) and not f.startswith("~$")
    )
    if not arquivos:
        sys.exit(f"Nenhum .docx ou .pdf encontrado em {pasta_entrada}")

    pdfs_presentes = any(f.lower().endswith(".pdf") for f in arquivos)
    if pdfs_presentes and not PDFPLUMBER_DISPONIVEL:
        sys.exit(
            "ERRO: há arquivos .pdf a processar, mas pdfplumber não está instalado.\n"
            "Execute:  py -m pip install -r requirements.txt")

    caminho_log = os.path.join(pasta_saida, "log_anonimizacao.txt")
    linhas_log = [
        "LOG DE ANONIMIZAÇÃO DE RELATÓRIOS — " + datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        f"Entrada: {pasta_entrada}",
        f"Saída:   {pasta_saida}",
        "Categorias substituídas: CLIENTE (empresa/razão social), CNPJ, ENDERECO, "
        "PESSOA, EMAIL, TELEFONE.",
        "Arquivos que não puderam ser processados (corrompidos/protegidos) são "
        "PULADOS — nada é copiado para a pasta de saída nesses casos.",
        "=" * 78,
    ]

    total_contagens = Counter()
    processados, pulados = 0, 0

    for indice, nome_arquivo in enumerate(arquivos, 1):
        origem = os.path.join(pasta_entrada, nome_arquivo)
        base, extensao = os.path.splitext(nome_arquivo)
        extensao = extensao.lower()
        print(f"[{indice}/{len(arquivos)}] {nome_arquivo} ...", flush=True)
        linhas_log.append(f"\nARQUIVO: {nome_arquivo}")

        try:
            if extensao == ".docx":
                destino = os.path.join(pasta_saida, f"{base}_anon.docx")
                contagens, imagens_removidas = processar_docx(origem, destino)
                linhas_log.append(f"  Tipo: .docx -> {os.path.basename(destino)}")
                linhas_log.append(f"  Substituições: {_formatar_contagens(contagens)}")
                linhas_log.append(f"  Imagens removidas: {imagens_removidas}")
                total_contagens.update(contagens)
                processados += 1
                print(f"    OK — {_formatar_contagens(contagens)}; "
                      f"imagens removidas: {imagens_removidas}")
            else:  # .pdf
                destino = os.path.join(pasta_saida, f"{base}_anon.txt")
                contagens, ok, motivo = processar_pdf(origem, destino)
                if not ok:
                    pulados += 1
                    linhas_log.append(f"  *** PULADO: {motivo}")
                    print(f"    PULADO — {motivo}")
                    continue
                linhas_log.append(f"  Tipo: .pdf -> {os.path.basename(destino)} (texto extraído)")
                linhas_log.append(f"  Substituições: {_formatar_contagens(contagens)}")
                total_contagens.update(contagens)
                processados += 1
                print(f"    OK — {_formatar_contagens(contagens)}")
        except Exception:
            pulados += 1
            motivo = traceback.format_exc().splitlines()[-1]
            linhas_log.append(
                "  *** PULADO: arquivo corrompido, protegido ou com estrutura inesperada — "
                f"{motivo}")
            linhas_log.append(
                "  *** Detalhe completo:\n" +
                "\n".join(f"      {l}" for l in traceback.format_exc().splitlines()))
            print(f"    PULADO — {motivo}")

    resumo = [
        "",
        "=" * 78,
        "RESUMO GERAL",
        f"  Arquivos processados: {processados} | pulados: {pulados}",
        "  Total de substituições por categoria:",
    ]
    for categoria in CATEGORIAS:
        resumo.append(f"    - {categoria}: {total_contagens.get(categoria, 0)}")

    linhas_log.extend(resumo)
    with open(caminho_log, "w", encoding="utf-8") as arquivo_log:
        arquivo_log.write("\n".join(linhas_log) + "\n")
    print("\n".join(resumo))
    print(f"\nLog completo: {caminho_log}")


def main():
    parser = argparse.ArgumentParser(
        description="Anonimiza relatórios .docx e .pdf (empresa, CNPJ, endereço, "
                    "pessoa, e-mail, telefone) e remove imagens dos .docx.")
    parser.add_argument("--entrada", default=PASTA_ENTRADA_PADRAO,
                        help=f"pasta com os relatórios originais (padrão: {PASTA_ENTRADA_PADRAO})")
    parser.add_argument("--saida", default=PASTA_SAIDA_PADRAO,
                        help=f"pasta de saída (padrão: {PASTA_SAIDA_PADRAO})")
    argumentos = parser.parse_args()
    executar(argumentos.entrada, argumentos.saida)


if __name__ == "__main__":
    main()
