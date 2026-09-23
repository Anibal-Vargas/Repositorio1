"""Auto-atualização do aplicativo a partir de uma pasta de rede.

Como funciona
-------------
Na pasta compartilhada do servidor ficam dois arquivos, publicados a partir da
Release gerada pelo GitHub Actions::

    \\\\servidor\\NordConsult\\Aterramento\\
        versao.json                     {"versao": "1.1.0", "arquivo": "...", "sha256": "..."}
        RelatoriosAterramento_1.1.0.exe

Cada usuário roda uma **cópia local** (``%LOCALAPPDATA%\\NordConsult\\Aterramento``),
instalada pelo ``Instalar_Aterramento.bat`` que fica na mesma pasta de rede.
Ao abrir, o app lê o ``versao.json``; se houver versão mais nova, copia o
executável, confere o SHA-256, e se reinicia já na versão nova.

Por que a cópia local (e não rodar direto da rede):

* o Windows **trava** o .exe em uso — com todo mundo rodando da rede, não dá
  para publicar uma versão nova durante o expediente;
* a abertura pela rede é lenta;
* se a rede cair, o app continua abrindo na última versão baixada.

Onde o app procura a pasta de rede, nesta ordem:

1. variável de ambiente ``ATERRAMENTO_ATUALIZACAO``;
2. ``atualizacao.txt`` ao lado do executável;
3. ``atualizacao.txt`` na pasta local do aplicativo (gravado na instalação).

Nada disso configurado → o app simplesmente abre normalmente, sem checar
atualização. Qualquer falha (rede fora, arquivo corrompido, sem permissão) é
registrada em ``atualizacao.log`` e **nunca** impede o app de abrir.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import datetime

from . import VERSAO

# Nome estável do executável instalado — é para ele que o atalho aponta, e é
# ele que a atualização substitui.
NOME_ESTAVEL = "RelatoriosAterramento.exe"
NOME_TEMPORARIO = "RelatoriosAterramento_novo.exe"
ARQUIVO_ORIGEM = "atualizacao.txt"
ARQUIVO_INFO = "versao.json"
VARIAVEL_AMBIENTE = "ATERRAMENTO_ATUALIZACAO"


# ---------------------------------------------------------------------------
# Caminhos
# ---------------------------------------------------------------------------

def pasta_local() -> str:
    """Pasta onde o aplicativo fica instalado na máquina do usuário."""
    base = os.environ.get("LOCALAPPDATA")
    if base:
        return os.path.join(base, "NordConsult", "Aterramento")
    return os.path.join(os.path.expanduser("~"), ".aterramento", "app")


def empacotado() -> bool:
    """True quando rodando como .exe (PyInstaller), não como script Python."""
    return bool(getattr(sys, "frozen", False))


def _pasta_do_executavel() -> str | None:
    return os.path.dirname(os.path.abspath(sys.executable)) if empacotado() else None


def _ler_caminho(arquivo: str) -> str | None:
    try:
        with open(arquivo, encoding="utf-8-sig") as f:
            for linha in f:
                linha = linha.strip()
                # Permite comentários com "#" no atualizacao.txt.
                if linha and not linha.startswith("#"):
                    return linha
    except OSError:
        pass
    return None


def pasta_origem() -> str | None:
    """Pasta de rede de onde as atualizações vêm (None = não configurada)."""
    do_ambiente = os.environ.get(VARIAVEL_AMBIENTE, "").strip()
    if do_ambiente:
        return do_ambiente

    candidatas = []
    ao_lado = _pasta_do_executavel()
    if ao_lado:
        candidatas.append(os.path.join(ao_lado, ARQUIVO_ORIGEM))
    candidatas.append(os.path.join(pasta_local(), ARQUIVO_ORIGEM))

    for arquivo in candidatas:
        caminho = _ler_caminho(arquivo)
        if caminho:
            return caminho
    return None


def _log(mensagem: str) -> None:
    """Registra uma linha no atualizacao.log (nunca lança exceção)."""
    try:
        pasta = pasta_local()
        os.makedirs(pasta, exist_ok=True)
        carimbo = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        with open(os.path.join(pasta, "atualizacao.log"), "a",
                  encoding="utf-8") as f:
            f.write(f"{carimbo}  {mensagem}\n")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Comparação de versões
# ---------------------------------------------------------------------------

def _tupla(versao: str) -> tuple:
    """"1.10.2" -> (1, 10, 2, 0). Partes não numéricas viram 0.

    O resultado tem sempre 4 posições para que "1.0" e "1.0.0" sejam a mesma
    versão (senão a tupla mais longa venceria a comparação).
    """
    partes = []
    for p in str(versao).strip().split("."):
        try:
            partes.append(int(p))
        except ValueError:
            partes.append(0)
    partes = (partes + [0, 0, 0, 0])[:4]
    return tuple(partes)


def mais_nova(candidata: str, atual: str) -> bool:
    """True quando ``candidata`` é uma versão posterior a ``atual``."""
    return _tupla(candidata) > _tupla(atual)


# ---------------------------------------------------------------------------
# Verificação
# ---------------------------------------------------------------------------

@dataclass
class Disponivel:
    """Uma atualização encontrada na pasta de rede."""

    versao: str
    caminho: str          # .exe na pasta de rede
    sha256: str | None = None


def verificar(origem: str | None = None) -> Disponivel | None:
    """Devolve a atualização disponível, ou None se já estamos atualizados."""
    origem = origem if origem is not None else pasta_origem()
    if not origem:
        return None

    info_path = os.path.join(origem, ARQUIVO_INFO)
    try:
        with open(info_path, encoding="utf-8-sig") as f:
            info = json.load(f)
    except FileNotFoundError:
        _log(f"versao.json não encontrado em {origem}")
        return None
    except OSError as erro:
        _log(f"pasta de atualização inacessível ({origem}): {erro}")
        return None
    except json.JSONDecodeError as erro:
        _log(f"versao.json inválido: {erro}")
        return None

    versao = str(info.get("versao", "")).strip()
    arquivo = str(info.get("arquivo", "")).strip()
    if not versao or not arquivo:
        _log("versao.json sem os campos 'versao' e 'arquivo'")
        return None
    if not mais_nova(versao, VERSAO):
        return None

    caminho = os.path.join(origem, arquivo)
    if not os.path.exists(caminho):
        _log(f"versao.json aponta para {arquivo}, que não existe em {origem}")
        return None

    return Disponivel(versao=versao, caminho=caminho,
                      sha256=(info.get("sha256") or None))


def _sha256(caminho: str) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


# ---------------------------------------------------------------------------
# Aplicação da atualização
# ---------------------------------------------------------------------------

_SCRIPT_TROCA = """@echo off
rem Substitui o executavel assim que o aplicativo em uso terminar de fechar.
:aguardar
tasklist /FI "PID eq {pid}" 2>nul | find "{pid}" >nul
if not errorlevel 1 (
  ping -n 2 127.0.0.1 >nul
  goto aguardar
)
move /y "{novo}" "{alvo}" >nul
start "" "{alvo}"
(goto) 2>nul & del "%~f0"
"""


def aplicar(disponivel: Disponivel) -> bool:
    """Copia a versão nova e agenda a troca do executável.

    Devolve True quando a troca foi agendada — nesse caso quem chamou deve
    **encerrar o aplicativo** para que o substituto assuma.
    """
    destino_pasta = os.path.dirname(os.path.abspath(sys.executable))
    alvo = os.path.join(destino_pasta, NOME_ESTAVEL)
    novo = os.path.join(destino_pasta, NOME_TEMPORARIO)

    try:
        # Copia primeiro para um arquivo temporário na mesma pasta: se a rede
        # cair no meio, o executável em uso continua intacto.
        parcial = novo + ".parcial"
        shutil.copyfile(disponivel.caminho, parcial)

        if disponivel.sha256:
            obtido = _sha256(parcial)
            if obtido.lower() != disponivel.sha256.lower():
                os.remove(parcial)
                _log(f"SHA-256 não confere na versão {disponivel.versao} "
                     f"(esperado {disponivel.sha256}, obtido {obtido})")
                return False

        if os.path.exists(novo):
            os.remove(novo)
        os.replace(parcial, novo)
    except OSError as erro:
        _log(f"falha ao copiar a versão {disponivel.versao}: {erro}")
        return False

    try:
        script = os.path.join(tempfile.gettempdir(), "aterramento_atualizar.bat")
        with open(script, "w", encoding="cp1252", errors="replace") as f:
            f.write(_SCRIPT_TROCA.format(pid=os.getpid(), novo=novo, alvo=alvo))

        sinalizadores = 0
        if hasattr(subprocess, "DETACHED_PROCESS"):
            sinalizadores = subprocess.DETACHED_PROCESS | subprocess.CREATE_NO_WINDOW
        subprocess.Popen(["cmd", "/c", script], creationflags=sinalizadores,
                         close_fds=True)
    except Exception as erro:
        _log(f"falha ao agendar a troca do executável: {erro}")
        return False

    _log(f"atualizando da versão {VERSAO} para {disponivel.versao}")
    return True


def _aviso(texto: str):
    """Janelinha 'Atualizando…' mostrada durante a cópia (best-effort)."""
    try:
        import tkinter as tk

        janela = tk.Tk()
        janela.title("Atualização")
        janela.configure(bg="#ffffff")
        janela.resizable(False, False)
        tk.Label(janela, text=texto, bg="#ffffff", fg="#2b2f36",
                 font=("Segoe UI", 11), padx=28, pady=22).pack()
        janela.update_idletasks()
        largura, altura = janela.winfo_width(), janela.winfo_height()
        x = (janela.winfo_screenwidth() - largura) // 2
        y = (janela.winfo_screenheight() - altura) // 2
        janela.geometry(f"+{x}+{y}")
        janela.update()
        return janela
    except Exception:
        return None


def checar_e_atualizar(mostrar_aviso: bool = True) -> bool:
    """Checa a pasta de rede e, havendo versão nova, atualiza.

    Devolve True quando o aplicativo deve **encerrar agora** (a versão nova
    está sendo iniciada no lugar). Em qualquer erro devolve False e o app
    segue normalmente na versão atual.
    """
    if not empacotado():
        return False  # em desenvolvimento (python iniciar_app.py) não atualiza

    # Só atualiza a cópia instalada na máquina. Rodando direto da pasta de rede
    # ou de Downloads, o app não tenta se substituir.
    try:
        aqui = os.path.normcase(os.path.dirname(os.path.abspath(sys.executable)))
        if aqui != os.path.normcase(os.path.abspath(pasta_local())):
            return False
    except Exception:
        return False

    try:
        disponivel = verificar()
    except Exception as erro:  # nunca impedir o app de abrir
        _log(f"erro inesperado na verificação: {erro}")
        return False
    if not disponivel:
        return False

    janela = _aviso(f"Atualizando para a versão {disponivel.versao}…\n"
                    "O aplicativo reabre sozinho em instantes.") if mostrar_aviso else None
    try:
        ok = aplicar(disponivel)
    finally:
        if janela is not None:
            try:
                janela.destroy()
            except Exception:
                pass
    return ok
