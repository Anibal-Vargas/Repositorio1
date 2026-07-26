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

import io
import os

import docx

from .configuracao import Configuracao
from .imagens import encaixar
from .modelo import Equipamento, Pacote
from .recursos import caminho_recurso

MODELO_GERAL = caminho_recurso("modelos", "Laudo_Geral_Padrao.docx")
MODELO_INDIVIDUAL = caminho_recurso("modelos", "Laudo_Individual_Padrao.docx")

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
        # (f) Certificado de calibração — data e validade
        "Aferição 20/03/2025 e validade da medição de 01 ano":
            f"Aferição {config.calibracao_data} e validade do certificado até "
            f"{config.calibracao_validade}",
    }
    _aplicar_substituicoes(doc, subs)
    _aplicar_imagens_config(doc, config)  # (d)(e) logo, equipamento, selo

    os.makedirs(os.path.dirname(os.path.abspath(caminho_saida)), exist_ok=True)
    doc.save(caminho_saida)
    return caminho_saida


def _nome_arquivo_seguro(texto: str) -> str:
    return texto.replace("/", "-").replace("\\", "-").replace(":", "-").strip()


# --- Laudo Individual -----------------------------------------------------

LIMITE_ADEQUADO = 1000.0  # mΩ (efetiva ≤ 1000 -> ESTÁ / adequado)


def _preparar_imagem(caminho: str, formato: str, max_lado: int = 1200, q: int = 85):
    """Redimensiona e reencoda a foto no formato do placeholder. Devolve
    (bytes, (largura, altura))."""
    from PIL import Image

    im = Image.open(caminho).convert("RGB")
    w, h = im.size
    if max(w, h) > max_lado:
        f = max_lado / max(w, h)
        im = im.resize((max(1, int(w * f)), max(1, int(h * f))))
    buf = io.BytesIO()
    im.save(buf, "PNG" if formato == "png" else "JPEG", quality=q)
    return buf.getvalue(), im.size


def _trocar_imagem(doc, inline_shape, caminho_foto: str) -> None:
    """Substitui a imagem de um inline shape pela foto, preservando a largura
    do placeholder e ajustando a altura para manter o aspecto."""
    rId = inline_shape._inline.graphic.graphicData.pic.blipFill.blip.embed
    parte = doc.part.related_parts[rId]
    formato = "png" if "png" in (parte.content_type or "") else "jpeg"
    blob, (w, h) = _preparar_imagem(caminho_foto, formato)
    parte._blob = blob
    larg = inline_shape.width
    inline_shape.height = int(larg * h / w)


def _substituir_parte_imagem(doc, nome_parte: str, caminho_novo: str) -> bool:
    """Substitui o conteúdo da parte de imagem ``/word/media/<nome_parte>`` —
    atualiza todas as referências (capa e cabeçalhos compartilham a parte)."""
    alvo = f"/word/media/{nome_parte}"
    for part in doc.part.package.iter_parts():
        if str(part.partname) == alvo:
            formato = "png" if nome_parte.lower().endswith(".png") else "jpeg"
            part._blob = encaixar(caminho_novo, part.blob, formato)
            return True
    return False


def _aplicar_imagens_config(doc, config: Configuracao) -> None:
    """(d)(e) Substitui logo do cliente (capa e cabeçalhos), imagem do
    equipamento e selo de calibração pelas imagens fornecidas na configuração."""
    if config.logo_cliente and os.path.exists(config.logo_cliente):
        # image1.png: capa/cabeçalho (individual) e capa (geral).
        _substituir_parte_imagem(doc, "image1.png", config.logo_cliente)
        # image9.png: logo do cabeçalho do laudo geral.
        _substituir_parte_imagem(doc, "image9.png", config.logo_cliente)
    if config.imagem_equipamento and os.path.exists(config.imagem_equipamento):
        _substituir_parte_imagem(doc, "image2.jpeg", config.imagem_equipamento)
    if config.imagem_selo_calibracao and os.path.exists(config.imagem_selo_calibracao):
        _substituir_parte_imagem(doc, "image3.png", config.imagem_selo_calibracao)


def gerarLaudoIndividual(
    equipamento: Equipamento,
    config: Configuracao,
    data_medicoes,
    valor_medido: float,
    caminho_saida: str,
    prolongador: float | None = None,
    modelo: str | None = None,
) -> str:
    """Gera o laudo individual (.docx) de uma máquina preenchendo o modelo.

    ``valor_medido`` em mΩ (informado/confirmado pelo operador). ``prolongador``
    em mΩ; se None, usa o do equipamento ou o padrão da configuração.
    """
    doc = docx.Document(modelo or MODELO_INDIVIDUAL)
    if prolongador is None:
        prolongador = (
            equipamento.prolongador
            if equipamento.prolongador is not None
            else config.prolongador_padrao
        )
    efetiva = valor_medido - prolongador
    adequado = efetiva <= LIMITE_ADEQUADO
    data_ext = data_por_extenso(data_medicoes)
    # (a) Na capa, o nome do equipamento vai SEM o prefixo numérico "NN - ".
    nome_upper = equipamento.nome_sem_numero.upper()

    subs = {
        # Capa
        "COOPERATIVA CENTRAL – INCUBATÓRIO IBIAÇÁ - RS": config.capa_ind_unidade,
        "INCUBATÓRIO IBIAÇÁ - RS": config.capa_ind_local,
        "INCUBADORA 48": nome_upper,
        "Chapecó – SC, 09 de março de 2026": f"{config.cidade}, {data_ext}",
        # Engenheiro
        "Aníbal Rosa Vargas": config.engenheiro,
        "CREA-SC – 069788-5": f"CREA-SC – {config.crea}",
        # (f) Certificado de calibração — data e validade
        "certificado de calibração pelo fabricante na data 20/03/2025":
            f"certificado de calibração pelo fabricante na data "
            f"{config.calibracao_data}, com validade até {config.calibracao_validade}",
    }
    # Linhas de MEDIÇÃO: resolve a string exata do modelo por prefixo (o modelo
    # usa o sinal de ohm U+2126, então reaproveitamos o caractere do próprio
    # texto em vez de digitá-lo).
    medicao = {
        "Valor medido = ": _fmt(valor_medido),
        "Resistência elétrica do cabo prolongador PT = ": _fmt(prolongador),
        "Resistência elétrica de aterramento efetiva = ": _fmt(efetiva),
    }
    for p in doc.paragraphs:
        for prefixo, valor in medicao.items():
            if p.text.startswith(prefixo):
                antigo = p.text
                ohm = antigo[-1]  # 'Ω' (U+2126) tal como no modelo
                subs[antigo] = f"{prefixo}{valor}m{ohm}"

    # (b)(c) Corrige as legendas das figuras (troca de descrição entre Fig. 2 e 3),
    # preservando o traço/espaçamento do próprio modelo.
    import re
    for p in doc.paragraphs:
        m2 = re.match(r"(Figura\s*2\s*[–-]\s*)", p.text)
        m3 = re.match(r"(Figura\s*3\s*[–-]\s*)", p.text)
        if m2:
            subs[p.text] = m2.group(1) + "Registro ensaio continuidade no equipamento"
        elif m3:
            subs[p.text] = m3.group(1) + "Resultado medição"
    if not adequado:
        subs["conclui-se que o equipamento  ESTÁ  solidamente conectado"] = (
            "conclui-se que o equipamento  NÃO ESTÁ  solidamente conectado"
        )
    _aplicar_substituicoes(doc, subs)

    # Troca as duas fotos variáveis (as duas últimas imagens do modelo):
    # penúltima = equipamento (foto 01), última = valor medido (foto 02).
    imagens = doc.inline_shapes
    foto_maquina = equipamento.fotos_maquina[0] if equipamento.fotos_maquina else None
    foto_valor = equipamento.fotos_valor[0] if equipamento.fotos_valor else None
    if len(imagens) >= 2:
        if foto_maquina and os.path.exists(foto_maquina):
            _trocar_imagem(doc, imagens[-2], foto_maquina)
        if foto_valor and os.path.exists(foto_valor):
            _trocar_imagem(doc, imagens[-1], foto_valor)

    _aplicar_imagens_config(doc, config)  # (d)(e) logo, equipamento, selo

    os.makedirs(os.path.dirname(os.path.abspath(caminho_saida)), exist_ok=True)
    doc.save(caminho_saida)
    return caminho_saida


def gerarLaudosIndividuais(
    pacote: Pacote,
    config: Configuracao,
    data_medicoes,
    medicoes: dict,
    pasta_saida: str,
) -> list[str]:
    """Gera um laudo individual (.docx) por máquina que tenha valor medido.

    ``medicoes``: ``{id_equipamento: {"valor": float, "prolongador": float|None}}``.
    Máquinas sem valor medido informado são puladas (não há como preencher a
    seção de medição). Devolve a lista de caminhos gerados.
    """
    os.makedirs(pasta_saida, exist_ok=True)
    gerados = []
    for eq in pacote.equipamentos:
        med = medicoes.get(eq.chave, {})
        valor = med.get("valor")
        if valor is None:
            continue
        # Nome do arquivo = nome da máquina (sem o prefixo "Laudo - ").
        nome = _nome_arquivo_seguro(eq.nome) or f"equipamento-{eq.chave}"
        caminho = os.path.join(pasta_saida, f"{nome}.docx")
        gerarLaudoIndividual(
            eq, config, data_medicoes, valor, caminho,
            prolongador=med.get("prolongador"),
        )
        gerados.append(caminho)
    return gerados

