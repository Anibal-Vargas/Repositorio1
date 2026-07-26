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


def _saida_pdf(caminho: str, pasta_saida: str | None) -> str:
    base = os.path.splitext(os.path.basename(caminho))[0] + ".pdf"
    pasta = pasta_saida or os.path.dirname(os.path.abspath(caminho))
    return os.path.join(pasta, base)


# --- 1. Microsoft Office (Windows) ---------------------------------------

def _via_word(caminho: str, saida: str) -> bool:
    try:
        import win32com.client  # type: ignore
    except ImportError:
        return False
    word = None
    try:
        word = win32com.client.Dispatch("Word.Application")
        word.Visible = False
        doc = word.Documents.Open(os.path.abspath(caminho))
        doc.SaveAs(os.path.abspath(saida), FileFormat=17)  # 17 = PDF
        doc.Close(False)
        return os.path.exists(saida)
    except Exception:
        return False
    finally:
        if word is not None:
            try:
                word.Quit()
            except Exception:
                pass


def _via_excel(caminho: str, saida: str) -> bool:
    try:
        import win32com.client  # type: ignore
    except ImportError:
        return False
    excel = None
    try:
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        wb = excel.Workbooks.Open(os.path.abspath(caminho))
        wb.ExportAsFixedFormat(0, os.path.abspath(saida))  # 0 = PDF
        wb.Close(False)
        return os.path.exists(saida)
    except Exception:
        return False
    finally:
        if excel is not None:
            try:
                excel.Quit()
            except Exception:
                pass


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
    exe = _soffice()
    if not exe:
        return False
    pasta = os.path.dirname(os.path.abspath(saida))
    try:
        subprocess.run(
            [exe, "--headless", "--convert-to", "pdf", "--outdir", pasta,
             os.path.abspath(caminho)],
            check=True, timeout=180,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    except (subprocess.SubprocessError, OSError):
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

def disponivel() -> bool:
    """Indica se há alguma ferramenta de conversão para PDF disponível."""
    if sys.platform == "win32":
        try:
            import win32com.client  # noqa: F401
            return True
        except ImportError:
            pass
    return _soffice() is not None


def converter_para_pdf(caminho: str, pasta_saida: str | None = None) -> str | None:
    """Converte ``caminho`` (.docx/.xlsx) para PDF. Devolve o caminho ou None."""
    saida = _saida_pdf(caminho, pasta_saida)
    ext = os.path.splitext(caminho)[1].lower()

    if sys.platform == "win32":
        if ext == ".docx" and _via_word(caminho, saida):
            return saida
        if ext == ".xlsx" and _via_excel(caminho, saida):
            return saida
    if _via_libreoffice(caminho, saida):
        return saida
    return None
