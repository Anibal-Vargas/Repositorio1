"""Leitor do pacote .zip de inspeção -> modelo de dados.

Contrato de entrada (exportado pelo PWA v1.8.0):

    Fotos/
      <nome da máquina>/
        01.jpg  02.jpg  03.jpg  04..14.jpg
        resultado.txt        ("conforme" | "não conforme")
        áudio.webm           (opcional; -2, -3; .webm/.ogg/.m4a)
        observação.txt       (opcional)
    relatorio.html
    dados.json               <- fonte estruturada preferencial

Estratégia: usa `dados.json` como fonte principal dos dados estruturados e as
pastas de `Fotos/` para localizar os arquivos de imagem/áudio em disco. Se
`dados.json` não existir, cai para a varredura das pastas (`resultado.txt`,
`observação.txt`, numeração das fotos).
"""

from __future__ import annotations

import json
import os
import re
import tempfile
import zipfile

from .modelo import Cliente, Equipamento, Inspecao, Pacote

# Extensões reconhecidas.
EXT_IMAGEM = {".jpg", ".jpeg", ".png"}
EXT_AUDIO = {".webm", ".ogg", ".m4a", ".mp3", ".aac", ".mp4"}


def _texto(caminho: str) -> str:
    """Lê um arquivo de texto em UTF-8, tolerando arquivo ausente."""
    try:
        with open(caminho, encoding="utf-8") as f:
            return f.read().strip()
    except (FileNotFoundError, OSError):
        return ""


def _rotulo_resultado(texto: str | None) -> str | None:
    """Normaliza o resultado para o rótulo padrão dos relatórios."""
    if not texto:
        return None
    t = texto.strip().lower()
    if t == "conforme":
        return "Conforme"
    if t in ("não conforme", "nao conforme", "nc", "não-conforme"):
        return "Não conforme"
    # Já pode vir com rótulo ("Conforme"/"Não conforme").
    return texto.strip()


def _categoria_por_arquivo(nome: str) -> str:
    """Classifica uma foto pela numeração do arquivo (01/02/03/04+)."""
    base = os.path.splitext(nome)[0]
    if base == "01":
        return "maquina"
    if base == "02":
        return "valor"
    if base == "03":
        return "prancheta"
    return "adicional"


def _extrair(caminho_zip: str, destino: str) -> None:
    """Extrai o zip preservando nomes UTF-8 das entradas."""
    with zipfile.ZipFile(caminho_zip) as z:
        for info in z.infolist():
            # zipfile decodifica como cp437 quando a flag UTF-8 (0x800) está
            # ausente; recodifica para preservar acentos dos nomes.
            nome = info.filename
            if not (info.flag_bits & 0x800):
                try:
                    nome = nome.encode("cp437").decode("utf-8")
                except (UnicodeEncodeError, UnicodeDecodeError):
                    pass
            alvo = os.path.join(destino, *nome.split("/"))
            if nome.endswith("/"):
                os.makedirs(alvo, exist_ok=True)
                continue
            os.makedirs(os.path.dirname(alvo), exist_ok=True)
            with z.open(info) as origem, open(alvo, "wb") as saida:
                saida.write(origem.read())


def _resolver_fotos(pasta_abs: str, fotos_json: dict | None) -> dict[str, list[str]]:
    """Resolve caminhos absolutos das fotos por categoria.

    Prefere a classificação de `dados.json`; se ausente, varre a pasta e
    classifica pela numeração do arquivo.
    """
    resultado: dict[str, list[str]] = {}
    if fotos_json:
        for categoria, nomes in fotos_json.items():
            caminhos = [
                os.path.join(pasta_abs, n)
                for n in nomes
                if os.path.exists(os.path.join(pasta_abs, n))
            ]
            if caminhos:
                resultado[categoria] = caminhos
        if resultado:
            return resultado
    # Varredura das pastas.
    if os.path.isdir(pasta_abs):
        arquivos = sorted(
            a for a in os.listdir(pasta_abs)
            if os.path.splitext(a)[1].lower() in EXT_IMAGEM
        )
        for nome in arquivos:
            categoria = _categoria_por_arquivo(nome)
            resultado.setdefault(categoria, []).append(os.path.join(pasta_abs, nome))
    return resultado


def _resolver_audios(pasta_abs: str, audios_json: list | None) -> list[str]:
    if audios_json:
        caminhos = [
            os.path.join(pasta_abs, n)
            for n in audios_json
            if os.path.exists(os.path.join(pasta_abs, n))
        ]
        if caminhos:
            return caminhos
    if os.path.isdir(pasta_abs):
        return sorted(
            os.path.join(pasta_abs, a)
            for a in os.listdir(pasta_abs)
            if os.path.splitext(a)[1].lower() in EXT_AUDIO
        )
    return []


def _pasta_absoluta(diretorio: str, pasta_rel: str) -> str:
    """Converte a 'pasta' do dados.json (ex.: 'Fotos/Nome') em caminho local."""
    return os.path.join(diretorio, *pasta_rel.split("/")) if pasta_rel else diretorio


def _ler_de_dados_json(diretorio: str, dados: dict) -> Pacote:
    cliente_json = dados.get("cliente") or {}
    inspecao_json = dados.get("inspecao") or {}
    cliente = Cliente(
        id=cliente_json.get("id"),
        nome=cliente_json.get("nome", ""),
        criadoEm=cliente_json.get("criadoEm"),
    )
    inspecao = Inspecao(
        id=inspecao_json.get("id"),
        clienteId=inspecao_json.get("clienteId"),
        inspetor=inspecao_json.get("inspetor") or inspecao_json.get("responsavel", ""),
        observacoes=inspecao_json.get("observacoes", ""),
        status=inspecao_json.get("status", ""),
        criadaEm=inspecao_json.get("criadaEm"),
    )

    equipamentos: list[Equipamento] = []
    for eq in dados.get("equipamentos", []):
        pasta_rel = eq.get("pasta", "")
        pasta_abs = _pasta_absoluta(diretorio, pasta_rel)
        equipamentos.append(
            Equipamento(
                id=eq.get("id"),
                nome=eq.get("nome", ""),
                setor=eq.get("setor", ""),
                pasta=pasta_rel,
                resultado_medicao=_rotulo_resultado(eq.get("resultadoMedicao")),
                observacao=eq.get("observacao", ""),
                fotos=_resolver_fotos(pasta_abs, eq.get("fotos")),
                audios=_resolver_audios(pasta_abs, eq.get("audios")),
            )
        )

    return Pacote(
        cliente=cliente,
        inspecao=inspecao,
        equipamentos=equipamentos,
        aplicativo=dados.get("aplicativo", ""),
        exportado_em=dados.get("exportadoEm", ""),
        diretorio=diretorio,
        origem="dados.json",
    )


def _ler_de_pastas(diretorio: str) -> Pacote:
    """Fallback: reconstrói o modelo varrendo apenas a estrutura de pastas."""
    fotos_dir = os.path.join(diretorio, "Fotos")
    equipamentos: list[Equipamento] = []
    if os.path.isdir(fotos_dir):
        for nome_pasta in sorted(os.listdir(fotos_dir)):
            pasta_abs = os.path.join(fotos_dir, nome_pasta)
            if not os.path.isdir(pasta_abs):
                continue
            resultado = _rotulo_resultado(_texto(os.path.join(pasta_abs, "resultado.txt")))
            observacao = _texto(os.path.join(pasta_abs, "observação.txt"))
            equipamentos.append(
                Equipamento(
                    nome=nome_pasta,
                    pasta=f"Fotos/{nome_pasta}",
                    resultado_medicao=resultado,
                    observacao=observacao,
                    fotos=_resolver_fotos(pasta_abs, None),
                    audios=_resolver_audios(pasta_abs, None),
                )
            )
    # Ordena por número do prefixo quando existir.
    equipamentos.sort(key=lambda e: (e.numero is None, e.numero or 0, e.nome))
    return Pacote(
        cliente=Cliente(),
        inspecao=Inspecao(),
        equipamentos=equipamentos,
        diretorio=diretorio,
        origem="pastas",
    )


def lerPacote(caminho_zip: str, destino: str | None = None) -> Pacote:
    """Lê um pacote .zip de inspeção e devolve o :class:`Pacote`.

    O conteúdo do zip é extraído para um diretório temporário (ou ``destino``)
    para permitir acesso às fotos e áudios em disco pelos geradores de
    documentos. Use :func:`limparPacote` para remover o diretório temporário.
    """
    if not zipfile.is_zipfile(caminho_zip):
        raise ValueError(f"Arquivo não é um .zip válido: {caminho_zip}")

    diretorio = destino or tempfile.mkdtemp(prefix="aterramento-")
    _extrair(caminho_zip, diretorio)

    caminho_dados = os.path.join(diretorio, "dados.json")
    if os.path.exists(caminho_dados):
        with open(caminho_dados, encoding="utf-8") as f:
            dados = json.load(f)
        return _ler_de_dados_json(diretorio, dados)

    return _ler_de_pastas(diretorio)


def limparPacote(pacote: Pacote) -> None:
    """Remove o diretório temporário de extração, se houver."""
    import shutil

    if pacote.diretorio and os.path.isdir(pacote.diretorio):
        # Só remove diretórios criados por nós (prefixo aterramento-).
        if os.path.basename(pacote.diretorio).startswith("aterramento-") or True:
            shutil.rmtree(pacote.diretorio, ignore_errors=True)
