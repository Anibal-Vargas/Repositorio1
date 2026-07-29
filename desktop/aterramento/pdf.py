"""Conversão de documentos (.docx/.xlsx) para PDF.

Estratégia, na ordem:
1. **Microsoft Office** (Word/Excel) via COM — melhor fidelidade, se instalado
   no Windows (requer o pacote ``pywin32``).
2. **LibreOffice** (``soffice --headless --convert-to pdf``) — alternativa
   gratuita e multiplataforma, se instalado.

Se nenhum estiver disponível, devolve ``None`` (os documentos Word/Excel são
gerados normalmente; apenas o PDF é pulado).
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys


# Última falha de conversão (mensagem legível), para o app informar o usuário.
ULTIMO_ERRO: str | None = None


def _saida_pdf(caminho: str, pasta_saida: str | None) -> str:
    base = os.path.splitext(os.path.basename(caminho))[0] + ".pdf"
    pasta = pasta_saida or os.path.dirname(os.path.abspath(caminho))
    return os.path.join(pasta, base)


# --- 1. Microsoft Office (Windows) ---------------------------------------

def _via_word(caminho: str, saida: str) -> bool:
    global ULTIMO_ERRO
    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except ImportError:
        ULTIMO_ERRO = ("o pacote pywin32 não está instalado "
                       "(necessário para usar o Word)")
        return False
    word = None
    pythoncom.CoInitialize()
    try:
        word = win32com.client.DispatchEx("Word.Application")
        word.Visible = False
        word.DisplayAlerts = False
        doc = word.Documents.Open(os.path.abspath(caminho), ReadOnly=True)
        doc.SaveAs(os.path.abspath(saida), FileFormat=17)  # 17 = PDF
        doc.Close(False)
        return os.path.exists(saida)
    except Exception as e:
        ULTIMO_ERRO = f"Word: {e}"
        return False
    finally:
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


def _via_excel(caminho: str, saida: str) -> bool:
    global ULTIMO_ERRO
    try:
        import pythoncom  # type: ignore
        import win32com.client  # type: ignore
    except ImportError:
        ULTIMO_ERRO = ("o pacote pywin32 não está instalado "
                       "(necessário para usar o Excel)")
        return False
    excel = None
    pythoncom.CoInitialize()
    try:
        excel = win32com.client.DispatchEx("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        wb = excel.Workbooks.Open(os.path.abspath(caminho), ReadOnly=True)
        wb.ExportAsFixedFormat(0, os.path.abspath(saida))  # 0 = PDF
        wb.Close(False)
        return os.path.exists(saida)
    except Exception as e:
        ULTIMO_ERRO = f"Excel: {e}"
        return False
    finally:
        if excel is not None:
            try:
                excel.Quit()
            except Exception:
                pass
        pythoncom.CoUninitialize()


# --- 2. LibreOffice -------------------------------------------------------

def _soffice() -> str | None:
    for nome in ("soffice", "soffice.com", "libreoffice"):
        caminho = shutil.which(nome)
        if caminho:
            return caminho
    # Caminhos comuns no Windows.
    for p in (
        r"C:\Program Files\LibreOffice\program\soffice.exe",
        r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
    ):
        if os.path.exists(p):
            return p
    return None


def _via_libreoffice(caminho: str, saida: str) -> bool:
    global ULTIMO_ERRO
    exe = _soffice()
    if not exe:
        return False
    pasta = os.path.dirname(os.path.abspath(saida))
    try:
        proc = subprocess.run(
            [exe, "--headless", "--convert-to", "pdf", "--outdir", pasta,
             os.path.abspath(caminho)],
            check=True, timeout=300,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        saida_txt = (proc.stdout or b"").decode("utf-8", "ignore") + \
                    (proc.stderr or b"").decode("utf-8", "ignore")
        if "Error" in saida_txt:
            ULTIMO_ERRO = f"LibreOffice: {saida_txt.strip()[:200]}"
    except (subprocess.SubprocessError, OSError) as e:
        ULTIMO_ERRO = f"LibreOffice: {e}"
        return False
    # O LibreOffice nomeia o PDF pelo nome base do arquivo de origem.
    gerado = os.path.join(pasta, os.path.splitext(os.path.basename(caminho))[0] + ".pdf")
    if gerado != saida and os.path.exists(gerado):
        try:
            os.replace(gerado, saida)
        except OSError:
            return os.path.exists(gerado)
    return os.path.exists(saida)


# --- API ------------------------------------------------------------------

def _tem_pywin32() -> bool:
    try:
        import win32com.client  # noqa: F401
        return True
    except ImportError:
        return False


def disponivel() -> bool:
    """Indica se há alguma ferramenta de conversão para PDF disponível."""
    if sys.platform == "win32" and _tem_pywin32():
        return True
    return _soffice() is not None


def como_habilitar() -> str:
    """Mensagem explicando o que instalar para conseguir gerar PDF."""
    if sys.platform == "win32":
        if not _tem_pywin32():
            return ("Para gerar os PDFs pelo Word/Excel, abra o Prompt de "
                    "Comando e execute:\n\n    pip install pywin32\n\n"
                    "Como alternativa, instale o LibreOffice (gratuito).")
        return ("Não foi possível usar o Word/Excel para converter. Verifique "
                "se o Microsoft Office está instalado e funcionando, ou "
                "instale o LibreOffice (gratuito).")
    return "Instale o LibreOffice (gratuito) para converter os documentos."


def converter_para_pdf(caminho: str, pasta_saida: str | None = None) -> str | None:
    """Converte ``caminho`` (.docx/.xlsx) para PDF. Devolve o caminho ou None.

    Em caso de falha, o motivo fica em :data:`ULTIMO_ERRO`.
    """
    global ULTIMO_ERRO
    ULTIMO_ERRO = None
    saida = _saida_pdf(caminho, pasta_saida)
    ext = os.path.splitext(caminho)[1].lower()

    if sys.platform == "win32":
        if ext == ".docx" and _via_word(caminho, saida):
            return saida
        if ext == ".xlsx" and _via_excel(caminho, saida):
            return saida
    if _via_libreoffice(caminho, saida):
        return saida
    if ULTIMO_ERRO is None:
        ULTIMO_ERRO = "nenhum conversor disponível (Word/Excel ou LibreOffice)"
    return None
