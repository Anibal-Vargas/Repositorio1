#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
converter_png_jpeg.py — 2ª PASSADA: converte PNGs FOTOGRÁFICOS para JPEG
dentro de relatórios .docx já reduzidos pela 1ª passada (reduzir_docx.py),
para os arquivos que ainda ficaram acima de 100 MB.

Só rode este script depois de já ter executado reduzir_docx.py e você
AUTORIZAR esta 2ª passada — ela é mais invasiva, pois além de recomprimir,
troca o FORMATO de algumas imagens (PNG -> JPEG).

O QUE MUDA DENTRO DO .DOCX (e por que o layout não é afetado)
---------------------------------------------------------------
Um .docx referencia cada imagem por um "Id de relacionamento" (rId), não
pelo nome do arquivo: o texto do documento (word/document.xml, cabeçalhos,
rodapés etc.) nunca menciona "image7.png" diretamente, ele contém algo como
<a:blip r:embed="rId12"/>. É o arquivo word/_rels/document.xml.rels que
traduz rId12 -> media/image7.png.

Por isso, converter um PNG para JPEG NÃO exige tocar no texto do documento:
  1. word/media/imageN.png é recomprimido e vira word/media/imageN.jpeg
     (ou imageN_conv.jpeg em caso de colisão de nomes);
  2. em TODOS os arquivos .rels que apontavam para esse PNG (documento
     principal, cabeçalhos, rodapés, notas etc.), o atributo Target é
     atualizado para o novo nome .jpeg — essa é a "atualização das
     referências internas";
  3. em [Content_Types].xml garante-se que a extensão jpeg/jpg está
     declarada (adiciona-se o Default se estiver faltando); nada mais é
     alterado;
  4. word/document.xml e as demais partes de texto permanecem BYTE A BYTE
     idênticas ao arquivo de entrada — a validação confere isso por CRC.

CRITÉRIO "PNG FOTOGRÁFICO" (só esses são convertidos)
------------------------------------------------------
  - tamanho >= 200 KB (mesmo piso da 1ª passada);
  - SEM transparência real (canal alfa com valores intermediários — PNGs
    totalmente opacos, com ou sem canal alfa, são elegíveis);
  - "textura fotográfica": depois de reduzida a RGB, a imagem tem muitas
    cores distintas (heurística: mais de 4096 cores). PNGs de poucas cores
    (logos, diagramas, carimbos, capturas de tela com texto) são mantidos
    como PNG — nesses casos o JPEG costuma piorar a nitidez e não reduzir
    o tamanho;
  - se a versão JPEG gerada não ficar nitidamente menor que o PNG original
    (ao menos 5 %), a conversão é descartada e o PNG original é mantido.

VALIDAÇÃO OBRIGATÓRIA (mesmo rigor da 1ª passada)
----------------------------------------------------
  - abre com python-docx sem erros; nº de parágrafos, tabelas e imagens
    inline idêntico ao arquivo de entrada desta passada;
  - TODAS as partes que não são .rels / [Content_Types].xml / mídia
    convertida permanecem byte a byte idênticas (CRC) — inclui
    document.xml, cabeçalhos, rodapés, notas, estilos etc.;
  - cada arquivo .rels é conferido relacionamento a relacionamento: o
    único tipo de diferença permitido é o Target apontar para o novo nome
    .jpeg no lugar do .png convertido — qualquer outra mudança reprova;
  - [Content_Types].xml só pode ganhar a declaração da extensão jpeg/jpg
    (e perder Overrides órfãos dos PNGs convertidos, se existirem) — mais
    nada pode mudar;
  - cada novo JPEG é reaberto com Pillow para conferir integridade.
  - Se qualquer verificação falhar, o arquivo gerado é descartado, uma
    cópia INTACTA do arquivo de entrada desta passada é colocada na pasta
    de saída, e a falha é registrada no log.

Uso (Windows), depois de já ter rodado reduzir_docx.py:
    py converter_png_jpeg.py
    py converter_png_jpeg.py --entrada "C:\\Temp\\RNCs\\Compactados" --saida "C:\\Temp\\RNCs\\Compactados_v2"
    py converter_png_jpeg.py --somente-grandes

Requisitos: Python 3.8+, Pillow, python-docx  (py -m pip install -r requirements.txt)
"""

import argparse
import gc
import io
import os
import posixpath
import shutil
import sys
import traceback
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime

try:
    from PIL import Image
except ImportError:
    sys.exit("ERRO: Pillow não instalado. Execute:  py -m pip install pillow")
try:
    import docx  # noqa: F401  (usado indiretamente via docx_common)
except ImportError:
    sys.exit("ERRO: python-docx não instalado. Execute:  py -m pip install python-docx")

from docx_common import (
    QUALIDADE_JPEG, TAMANHO_MINIMO, LIMITE_ALERTA, CHUNK,
    EXT_PNG, fmt_mb, eh_media, ext, copiar_zipinfo,
    redimensionar_se_preciso, contagens_docx,
)

# ----------------------------- Configuração ---------------------------------

PASTA_ENTRADA_PADRAO = r"C:\Temp\RNCs\Compactados"
PASTA_SAIDA_PADRAO = r"C:\Temp\RNCs\Compactados_v2"

MIN_CORES_FOTOGRAFICO = 4096  # abaixo disso, tratamos como logo/diagrama
REDUCAO_MINIMA = 0.05         # exige >= 5% de redução para valer a conversão

NS_CT = "http://schemas.openxmlformats.org/package/2006/content-types"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
TIPO_REL_IMAGEM = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image"

# ----------------------- Heurística "PNG fotográfico" ------------------------


def _tem_transparencia_real(img):
    """True se houver pixels com alfa intermediário (transparência de verdade)."""
    if img.mode == "P" and "transparency" in img.info:
        img = img.convert("RGBA")
    if "A" not in img.mode:
        return False
    minimo, maximo = img.getchannel("A").getextrema()
    return (minimo, maximo) != (255, 255)


def _eh_fotografico(img, min_cores=MIN_CORES_FOTOGRAFICO):
    """True se a imagem (ainda na resolução ORIGINAL) tiver textura
    fotográfica (muitas cores distintas).

    Importante: recebe a imagem ANTES do redimensionamento para 1600 px.
    Um resize com LANCZOS (usado para dar qualidade às fotos) já cria cores
    intermediárias nas bordas de blocos de cor sólida — se a checagem
    rodasse depois do resize, um logo/diagrama de poucas cores poderia
    parecer "fotográfico" por causa dessas bordas suavizadas. Por isso a
    amostragem aqui reduz a imagem original com NEAREST (sem interpolação,
    preserva cores exatas) antes de contar as cores distintas.
    """
    amostra = img
    if max(amostra.size) > 512:
        fator = 512 / max(amostra.size)
        amostra = amostra.resize(
            (max(1, round(amostra.width * fator)), max(1, round(amostra.height * fator))),
            Image.NEAREST)
    if amostra.mode != "RGB":
        amostra = amostra.convert("RGB")
    # getcolors devolve None quando o nº de cores distintas excede maxcolors
    return amostra.getcolors(maxcolors=min_cores) is None


def converter_png_para_jpeg(dados, nome):
    """Tenta converter um PNG fotográfico para JPEG.

    Retorna (novos_bytes_jpeg, None) em caso de sucesso, ou (None, motivo)
    quando o PNG deve ser mantido como está.
    """
    with Image.open(io.BytesIO(dados)) as img:
        if img.format != "PNG":
            return None, f"conteúdo não é PNG ({img.format or 'desconhecido'}) — mantida"
        if getattr(img, "is_animated", False):
            return None, "PNG animado (mantida)"
        img.load()

        if _tem_transparencia_real(img):
            return None, "possui transparência real (mantida como PNG)"

        if not _eh_fotografico(img):
            return None, "poucas cores — parece logo/diagrama (mantida como PNG)"

        img, _ = redimensionar_se_preciso(img)
        if img.mode == "P":
            img = img.convert("RGBA" if "transparency" in img.info else "RGB")
        img_rgb = img if img.mode == "RGB" else img.convert("RGB")

        buf = io.BytesIO()
        parametros = {"format": "JPEG", "quality": QUALIDADE_JPEG, "optimize": True}
        icc = img.info.get("icc_profile")
        if icc:
            parametros["icc_profile"] = icc
        img_rgb.save(buf, **parametros)
        novos = buf.getvalue()

    if len(novos) > len(dados) * (1 - REDUCAO_MINIMA):
        return None, "conversão não reduziu o suficiente (mantida como PNG)"
    return novos, None


# ----------------------- XML: [Content_Types].xml e .rels --------------------


def _serializar(root):
    corpo = ET.tostring(root, encoding="unicode")
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + corpo).encode("utf-8")


def _determinar_extensao_jpeg(dados_content_types):
    root = ET.fromstring(dados_content_types)
    extensoes = {e.get("Extension", "").lower() for e in root.findall(f"{{{NS_CT}}}Default")}
    if "jpeg" in extensoes:
        return "jpeg"
    if "jpg" in extensoes:
        return "jpg"
    return "jpeg"


def _atualizar_content_types(dados, extensao_jpeg, partnames_removidos):
    ET.register_namespace("", NS_CT)
    root = ET.fromstring(dados)
    tem_jpeg = any(
        e.get("Extension", "").lower() == extensao_jpeg
        for e in root.findall(f"{{{NS_CT}}}Default")
    )
    alterado = False
    if not tem_jpeg:
        novo = ET.SubElement(root, f"{{{NS_CT}}}Default")
        novo.set("Extension", extensao_jpeg)
        novo.set("ContentType", "image/jpeg")
        alterado = True
    for override in list(root.findall(f"{{{NS_CT}}}Override")):
        if override.get("PartName") in partnames_removidos:
            root.remove(override)
            alterado = True
    if not alterado:
        return dados, False
    return _serializar(root), True


def _resolver_alvo(rels_path, target):
    """Resolve um Target de .rels (relativo à pasta da parte-dona) para um
    caminho absoluto dentro do ZIP, sempre com '/' (independente do SO)."""
    if target.startswith("/"):
        return target.lstrip("/")
    diretorio_parte = posixpath.dirname(posixpath.dirname(rels_path))
    return posixpath.normpath(posixpath.join(diretorio_parte, target))


def _atualizar_rels(dados, rels_path, renomeacoes):
    """renomeacoes: dict {caminho_zip_png: caminho_zip_jpeg} (caminhos absolutos)."""
    ET.register_namespace("", NS_REL)
    root = ET.fromstring(dados)
    alterado = False
    for rel in root.findall(f"{{{NS_REL}}}Relationship"):
        if rel.get("Type") != TIPO_REL_IMAGEM:
            continue
        alvo = rel.get("Target")
        if not alvo or alvo.startswith("http://") or alvo.startswith("https://"):
            continue  # imagem externa (linkada) — não mexemos
        resolvido = _resolver_alvo(rels_path, alvo)
        if resolvido in renomeacoes:
            novo_nome = posixpath.basename(renomeacoes[resolvido])
            prefixo = alvo[: alvo.rfind("/") + 1] if "/" in alvo else ""
            rel.set("Target", prefixo + novo_nome)
            alterado = True
    if not alterado:
        return dados, False
    return _serializar(root), True


# ------------------------------ Processamento --------------------------------


def processar_docx_conversao(origem, destino_tmp):
    """Gera destino_tmp a partir de origem, convertendo PNGs fotográficos de
    word/media para JPEG e atualizando .rels / [Content_Types].xml.

    Retorna um dicionário de estatísticas, incluindo 'renomeacoes': dict
    {caminho_zip_png_original: caminho_zip_jpeg_novo}. Lê a origem SOMENTE
    para leitura.
    """
    stats = {"convertidas": 0, "puladas": 0, "detalhes": [], "renomeacoes": {}}

    with zipfile.ZipFile(origem, "r") as zin:
        nomes = zin.namelist()
        if "[Content_Types].xml" not in nomes:
            raise ValueError("[Content_Types].xml ausente — não é um .docx válido")
        dados_content_types = zin.read("[Content_Types].xml")
        extensao_jpeg = _determinar_extensao_jpeg(dados_content_types)

        candidatos = [
            item for item in zin.infolist()
            if eh_media(item.filename) and ext(item.filename) in EXT_PNG
            and item.file_size >= TAMANHO_MINIMO
        ]

        renomeacoes = {}          # caminho_zip_png -> caminho_zip_jpeg
        conteudo_convertido = {}  # caminho_zip_jpeg -> bytes
        nomes_existentes = set(nomes)

        for item in candidatos:
            dados = zin.read(item.filename)
            try:
                novos, motivo = converter_png_para_jpeg(dados, item.filename)
            except Exception as exc:  # imagem problemática: manter como PNG
                novos, motivo = None, f"erro ao processar ({exc}) — mantida como PNG"

            if novos is None:
                stats["puladas"] += 1
                stats["detalhes"].append(f"    - {item.filename}: {motivo}")
                del dados
                continue

            base, _ = posixpath.splitext(item.filename)
            novo_nome = f"{base}.{extensao_jpeg}"
            sufixo = 1
            while novo_nome in nomes_existentes:
                sufixo += 1
                novo_nome = f"{base}_conv{sufixo}.{extensao_jpeg}"

            renomeacoes[item.filename] = novo_nome
            conteudo_convertido[novo_nome] = novos
            nomes_existentes.add(novo_nome)
            stats["convertidas"] += 1
            stats["detalhes"].append(
                f"    - {item.filename} -> {novo_nome}: {fmt_mb(len(dados))} -> {fmt_mb(len(novos))}")
            del dados, novos

        if not renomeacoes:
            stats["renomeacoes"] = {}
            return stats  # nada a fazer; o chamador copia o arquivo direto

        partnames_removidos = {"/" + nome for nome in renomeacoes}
        dados_content_types, _ = _atualizar_content_types(
            dados_content_types, extensao_jpeg, partnames_removidos)

        with zipfile.ZipFile(destino_tmp, "w", zipfile.ZIP_DEFLATED) as zout:
            for item in zin.infolist():
                nome = item.filename
                if item.is_dir():
                    zout.writestr(copiar_zipinfo(item), b"")
                    continue

                if nome in renomeacoes:
                    novo_nome = renomeacoes[nome]
                    novo_info = zipfile.ZipInfo(filename=novo_nome, date_time=item.date_time)
                    novo_info.compress_type = zipfile.ZIP_DEFLATED
                    novo_info.external_attr = item.external_attr
                    novo_info.create_system = item.create_system
                    zout.writestr(novo_info, conteudo_convertido[novo_nome])
                    continue

                if nome == "[Content_Types].xml":
                    zout.writestr(copiar_zipinfo(item), dados_content_types)
                    continue

                if nome.endswith(".rels"):
                    dados_rels, _ = _atualizar_rels(zin.read(nome), nome, renomeacoes)
                    zout.writestr(copiar_zipinfo(item), dados_rels)
                    continue

                with zin.open(item) as fin, zout.open(copiar_zipinfo(item), "w") as fout:
                    shutil.copyfileobj(fin, fout, CHUNK)

    stats["renomeacoes"] = renomeacoes
    return stats


# -------------------------------- Validação ----------------------------------


def _validar_rels(dados1, dados2, rels_path, renomeacoes):
    root1 = ET.fromstring(dados1)
    root2 = ET.fromstring(dados2)
    rels1 = {r.get("Id"): r for r in root1.findall(f"{{{NS_REL}}}Relationship")}
    rels2 = {r.get("Id"): r for r in root2.findall(f"{{{NS_REL}}}Relationship")}
    if set(rels1) != set(rels2):
        return False, "conjunto de Ids de relacionamento mudou"
    for rid, r1 in rels1.items():
        r2 = rels2[rid]
        if r1.get("Type") != r2.get("Type") or r1.get("TargetMode") != r2.get("TargetMode"):
            return False, f"relacionamento {rid}: Type/TargetMode alterado"
        alvo1, alvo2 = r1.get("Target"), r2.get("Target")
        if alvo1 == alvo2:
            continue
        if r1.get("Type") != TIPO_REL_IMAGEM:
            return False, f"relacionamento {rid}: Target alterado em relacionamento não-imagem"
        resolvido1 = _resolver_alvo(rels_path, alvo1)
        if resolvido1 not in renomeacoes:
            return False, f"relacionamento {rid}: Target alterado sem conversão correspondente"
        novo_nome_esperado = posixpath.basename(renomeacoes[resolvido1])
        prefixo = alvo1[: alvo1.rfind("/") + 1] if "/" in alvo1 else ""
        if alvo2 != prefixo + novo_nome_esperado:
            return False, f"relacionamento {rid}: novo Target inesperado ({alvo2})"
    return True, None


def _validar_content_types(dados1, dados2, renomeacoes):
    root1 = ET.fromstring(dados1)
    root2 = ET.fromstring(dados2)
    defaults1 = {e.get("Extension", "").lower() for e in root1.findall(f"{{{NS_CT}}}Default")}
    defaults2 = {e.get("Extension", "").lower() for e in root2.findall(f"{{{NS_CT}}}Default")}
    if not defaults1.issubset(defaults2):
        return False, "um Default existente foi removido"
    if defaults2 - defaults1 - {"jpeg", "jpg"}:
        return False, f"Default(s) inesperado(s) adicionado(s): {defaults2 - defaults1}"

    overrides1 = {e.get("PartName"): e.get("ContentType") for e in root1.findall(f"{{{NS_CT}}}Override")}
    overrides2 = {e.get("PartName"): e.get("ContentType") for e in root2.findall(f"{{{NS_CT}}}Override")}
    partnames_removidos = {"/" + n for n in renomeacoes}
    removidos = set(overrides1) - set(overrides2)
    if removidos - partnames_removidos:
        return False, f"Override(s) removido(s) indevidamente: {removidos - partnames_removidos}"
    if set(overrides2) - set(overrides1):
        return False, "Override(s) inesperado(s) adicionado(s)"
    for partname in set(overrides1) & set(overrides2):
        if overrides1[partname] != overrides2[partname]:
            return False, f"ContentType de {partname} alterado"
    return True, None


def validar_conversao(origem, gerado, renomeacoes):
    """Validação obrigatória. Retorna (ok, lista_de_mensagens)."""
    mensagens = []

    with zipfile.ZipFile(origem, "r") as z1, zipfile.ZipFile(gerado, "r") as z2:
        if z2.testzip() is not None:
            return False, ["ZIP gerado corrompido (testzip falhou)"]

        nomes1 = set(z1.namelist())
        nomes2 = set(z2.namelist())
        esperados = (nomes1 - set(renomeacoes.keys())) | set(renomeacoes.values())
        if nomes2 != esperados:
            faltando = sorted(esperados - nomes2)[:5]
            sobrando = sorted(nomes2 - esperados)[:5]
            return False, [f"lista de membros do ZIP inesperada. Faltando: {faltando} Sobrando: {sobrando}"]

        info1 = {i.filename: i for i in z1.infolist()}
        info2 = {i.filename: i for i in z2.infolist()}
        renomeados_novos = set(renomeacoes.values())
        for nome, i2 in info2.items():
            if nome in renomeados_novos or nome == "[Content_Types].xml" or nome.endswith(".rels"):
                continue  # alteração esperada — checada à parte
            i1 = info1.get(nome)
            if i1 is None or i1.CRC != i2.CRC or i1.file_size != i2.file_size:
                return False, [f"parte alterada indevidamente: {nome}"]
        mensagens.append(
            f"{len(nomes1) - len(renomeacoes)} partes não convertidas permanecem "
            "byte a byte idênticas (CRC) OK")

        n_media1 = sum(1 for n in nomes1 if eh_media(n))
        n_media2 = sum(1 for n in nomes2 if eh_media(n))
        if n_media1 != n_media2:
            return False, [f"nº de imagens em word/media difere: {n_media1} vs {n_media2}"]
        for novo_nome in renomeacoes.values():
            try:
                with Image.open(io.BytesIO(z2.read(novo_nome))) as img:
                    img.load()
            except Exception as exc:
                return False, [f"JPEG convertido corrompido: {novo_nome} ({exc})"]
        mensagens.append(
            f"imagens: {n_media1} = {n_media2} OK; {len(renomeacoes)} JPEG(s) "
            "convertido(s) e íntegro(s) OK")

        for nome in nomes1:
            if not nome.endswith(".rels"):
                continue
            ok, motivo = _validar_rels(z1.read(nome), z2.read(nome), nome, renomeacoes)
            if not ok:
                return False, [f"{nome}: {motivo}"]
        mensagens.append("arquivos .rels: referências às imagens conferidas OK")

        ok, motivo = _validar_content_types(
            z1.read("[Content_Types].xml"), z2.read("[Content_Types].xml"), renomeacoes)
        if not ok:
            return False, [f"[Content_Types].xml: {motivo}"]
        mensagens.append("[Content_Types].xml: alterações dentro do esperado OK")

    paragrafos1, tabelas1, formas1 = contagens_docx(origem)
    paragrafos2, tabelas2, formas2 = contagens_docx(gerado)
    if (paragrafos1, tabelas1, formas1) != (paragrafos2, tabelas2, formas2):
        return False, [
            "contagens diferem: parágrafos {} vs {}, tabelas {} vs {}, imagens inline {} vs {}".format(
                paragrafos1, paragrafos2, tabelas1, tabelas2, formas1, formas2)
        ]
    mensagens.append(
        f"parágrafos: {paragrafos1} OK; tabelas: {tabelas1} OK; imagens inline: {formas1} OK")
    return True, mensagens


# --------------------------------- Pipeline ----------------------------------


def executar(pasta_entrada, pasta_saida, somente_grandes):
    if not os.path.isdir(pasta_entrada):
        sys.exit(f"ERRO: pasta de entrada não existe: {pasta_entrada}")
    os.makedirs(pasta_saida, exist_ok=True)

    arquivos = sorted(
        f for f in os.listdir(pasta_entrada)
        if f.lower().endswith(".docx") and not f.startswith("~$")
    )
    if somente_grandes:
        arquivos = [f for f in arquivos
                   if os.path.getsize(os.path.join(pasta_entrada, f)) > LIMITE_ALERTA]
    if not arquivos:
        sys.exit("Nenhum .docx a processar" +
                 (" (nenhum acima de 100 MB — tente sem --somente-grandes)"
                  if somente_grandes else f" em {pasta_entrada}"))

    caminho_log = os.path.join(pasta_saida, "log_conversao_png_jpeg.txt")
    linhas_log = [
        "LOG DA 2ª PASSADA — CONVERSÃO PNG -> JPEG — " + datetime.now().strftime("%d/%m/%Y %H:%M:%S"),
        f"Entrada: {pasta_entrada}",
        f"Saída:   {pasta_saida}",
        f"Parâmetros: JPEG q={QUALIDADE_JPEG} | mínimo {TAMANHO_MINIMO // 1024} KB | "
        f"mín. {MIN_CORES_FOTOGRAFICO} cores distintas para considerar 'fotográfico' | "
        f"redução mínima exigida: {REDUCAO_MINIMA * 100:.0f} %",
        "=" * 78,
    ]
    resultados = []

    for indice, nome_arquivo in enumerate(arquivos, 1):
        origem = os.path.join(pasta_entrada, nome_arquivo)
        destino = os.path.join(pasta_saida, nome_arquivo)
        destino_tmp = destino + ".tmp"
        tamanho_antes = os.path.getsize(origem)
        print(f"[{indice}/{len(arquivos)}] {nome_arquivo} ({fmt_mb(tamanho_antes)}) ...", flush=True)
        linhas_log.append(f"\nARQUIVO: {nome_arquivo}")
        linhas_log.append(f"  Tamanho antes: {fmt_mb(tamanho_antes)}")

        falha = None
        stats = {"convertidas": 0, "puladas": 0, "detalhes": [], "renomeacoes": {}}
        try:
            stats = processar_docx_conversao(origem, destino_tmp)
            if not stats["renomeacoes"]:
                if os.path.exists(destino_tmp):
                    os.remove(destino_tmp)
                shutil.copy2(origem, destino)
                linhas_log.append(
                    "  Nenhum PNG fotográfico elegível — arquivo copiado sem alterações.")
            else:
                ok, msgs_validacao = validar_conversao(origem, destino_tmp, stats["renomeacoes"])
                if ok:
                    os.replace(destino_tmp, destino)
                    for msg in msgs_validacao:
                        linhas_log.append(f"  Validação: {msg}")
                else:
                    falha = "; ".join(msgs_validacao)
        except Exception:
            falha = "exceção durante o processamento:\n" + traceback.format_exc()

        if falha is not None:
            if os.path.exists(destino_tmp):
                os.remove(destino_tmp)
            shutil.copy2(origem, destino)
            linhas_log.append(f"  *** FALHA: {falha}")
            linhas_log.append("  *** Ação: arquivo gerado descartado; cópia intacta do "
                              "arquivo de entrada desta passada mantida na pasta de saída.")
            print(f"    FALHOU — arquivo de entrada copiado intacto. Motivo: {falha.splitlines()[0]}")

        tamanho_depois = os.path.getsize(destino)
        reducao = (1 - tamanho_depois / tamanho_antes) * 100 if tamanho_antes else 0.0
        linhas_log.append(f"  Tamanho depois: {fmt_mb(tamanho_depois)}")
        linhas_log.append(f"  Redução:        {reducao:.1f} %")
        linhas_log.append(
            f"  PNGs convertidos: {stats['convertidas']} | mantidos como PNG: {stats['puladas']}")
        linhas_log.extend(stats["detalhes"])
        print(f"    {fmt_mb(tamanho_antes)} -> {fmt_mb(tamanho_depois)} ({reducao:.1f} % de redução) | "
              f"PNG->JPEG: {stats['convertidas']} convertidos, {stats['puladas']} mantidos")

        resultados.append({
            "nome": nome_arquivo,
            "antes": tamanho_antes,
            "depois": tamanho_depois,
            "convertidas": stats["convertidas"],
            "falha": falha,
        })
        gc.collect()

    total_antes = sum(r["antes"] for r in resultados)
    total_depois = sum(r["depois"] for r in resultados)
    falhas = [r for r in resultados if r["falha"]]
    grandes = [r for r in resultados if r["depois"] > LIMITE_ALERTA]

    resumo = [
        "",
        "=" * 78,
        "RESUMO GERAL — 2ª PASSADA",
        f"  Arquivos processados: {len(resultados)} | com falha (entrada mantida): {len(falhas)}",
        f"  Total antes:  {fmt_mb(total_antes)}",
        f"  Total depois: {fmt_mb(total_depois)}",
        f"  Redução total: {(1 - total_depois / total_antes) * 100 if total_antes else 0:.1f} %",
    ]
    if grandes:
        resumo.append(f"\n  Ainda acima de 100 MB após a 2ª passada: {len(grandes)} arquivo(s):")
        for r in grandes:
            resumo.append(f"    - {r['nome']}: {fmt_mb(r['depois'])}")
    else:
        resumo.append("\n  Nenhum arquivo restou acima de 100 MB.")

    linhas_log.extend(resumo)
    with open(caminho_log, "w", encoding="utf-8") as arquivo_log:
        arquivo_log.write("\n".join(linhas_log) + "\n")
    print("\n".join(resumo))
    print(f"\nLog completo: {caminho_log}")
    return resultados


def main():
    parser = argparse.ArgumentParser(
        description="2ª passada: converte PNGs fotográficos para JPEG dentro de .docx, "
                    "atualizando as referências internas (.rels e [Content_Types].xml).")
    parser.add_argument("--entrada", default=PASTA_ENTRADA_PADRAO,
                        help=f"pasta com os .docx da 1ª passada (padrão: {PASTA_ENTRADA_PADRAO})")
    parser.add_argument("--saida", default=PASTA_SAIDA_PADRAO,
                        help=f"pasta de saída (padrão: {PASTA_SAIDA_PADRAO})")
    parser.add_argument("--somente-grandes", action="store_true",
                        help="processa apenas os .docx que ainda estão acima de 100 MB")
    argumentos = parser.parse_args()
    executar(argumentos.entrada, argumentos.saida, argumentos.somente_grandes)


if __name__ == "__main__":
    main()
