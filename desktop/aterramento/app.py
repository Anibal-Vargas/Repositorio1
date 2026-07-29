"""Tela do aplicativo desktop (Tkinter) — Nord Consult.

Fluxo:
1. Configuração (uma vez): contratante, proposta, cidade, engenheiro, imagens
   (logo do cliente, equipamento, selo de calibração) e datas da calibração.
2. Abrir o pacote .zip da inspeção → conferir cabeçalho e, por máquina, ver o
   display ampliado e informar/confirmar o valor medido (mΩ).
3. Gerar planilha + laudo geral + laudos individuais na pasta escolhida.

Tudo local/offline. Tkinter vem com o Python e empacota bem como .exe.
"""

from __future__ import annotations

import datetime
import os
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from .configuracao import Configuracao
from .geracao import gerar_todos
from .leitor import lerPacote, limparPacote
from .recursos import caminho_recurso

# Paleta Nord Consult.
LARANJA = "#f08019"
LARANJA_FORTE = "#c25e00"
GRAFITE = "#2b2f36"
CINZA = "#6b7280"
VERDE = "#2e7d32"
VERMELHO = "#b3261e"
BRANCO = "#ffffff"

CONFIG_PATH = os.path.join(os.path.expanduser("~"), ".aterramento", "config.json")

# Texto exibido na barra (cabeçalho) das telas.
TITULO = "Gerador de documentos de medições de continuidade de aterramento elétrico"

# Título da janela do sistema (canto superior esquerdo).
TITULO_JANELA = ("Medição de continuidade de aterramento elétrico de "
                 "máquinas e equipamentos")

# Rótulos amigáveis dos campos de configuração (ordem de exibição por grupo).
GRUPOS_CONFIG = [
    ("Inspeção", [
        ("data_inspecao", "Data da inspeção (dd/mm/aaaa)"),
        ("unidade", "Unidade (capa dos laudos)"),
    ]),
    ("Empresa responsável (Nord)", [
        ("engenheiro", "Engenheiro responsável"),
        ("crea", "CREA"),
        ("cidade", "Cidade (assinatura)"),
    ]),
    ("Certificado de calibração", [
        ("calibracao_data", "Data de aferição"),
        ("calibracao_validade", "Validade do certificado"),
    ]),
]

# Campos de imagem (seletores de arquivo).
CAMPOS_IMAGEM = [
    ("logo_cliente", "Logomarca do cliente"),
    ("imagem_equipamento", "Imagem do equipamento (miliohmímetro)"),
    ("imagem_selo_calibracao", "Selo/certificado de calibração"),
]


def carregar_config() -> Configuracao:
    try:
        return Configuracao.carregar(CONFIG_PATH)
    except Exception:
        return Configuracao()


def salvar_config(config: Configuracao) -> None:
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    config.salvar(CONFIG_PATH)


# ---------------------------------------------------------------------------
# Utilidades de UI
# ---------------------------------------------------------------------------

def _frame_rolavel(pai):
    """Cria um frame com barra de rolagem vertical. Devolve (container, interno)."""
    container = tk.Frame(pai, bg=BRANCO)
    canvas = tk.Canvas(container, bg=BRANCO, highlightthickness=0)
    scroll = ttk.Scrollbar(container, orient="vertical", command=canvas.yview)
    interno = tk.Frame(canvas, bg=BRANCO)
    interno.bind("<Configure>",
                 lambda e: canvas.configure(scrollregion=canvas.bbox("all")))
    janela = canvas.create_window((0, 0), window=interno, anchor="nw")
    canvas.bind("<Configure>", lambda e: canvas.itemconfig(janela, width=e.width))
    canvas.configure(yscrollcommand=scroll.set)
    canvas.pack(side="left", fill="both", expand=True)
    scroll.pack(side="right", fill="y")

    def _roda(evento):
        canvas.yview_scroll(int(-1 * (evento.delta / 120)), "units")
    canvas.bind_all("<MouseWheel>", _roda)
    return container, interno


def _cabecalho(pai, texto: str):
    barra = tk.Frame(pai, bg=LARANJA_FORTE, height=54)
    barra.pack(fill="x", side="top")
    tk.Frame(barra, bg=GRAFITE, height=4).pack(fill="x", side="bottom")
    tk.Label(barra, text=texto, bg=LARANJA_FORTE, fg=BRANCO,
             font=("Segoe UI", 12, "bold")).pack(side="left", padx=16, pady=10)
    return barra


# ---------------------------------------------------------------------------
# Janela de configuração
# ---------------------------------------------------------------------------

class JanelaConfig(tk.Toplevel):
    def __init__(self, pai, config: Configuracao, ao_salvar=None):
        super().__init__(pai)
        self.title("Configuração (dados fixos)")
        self.geometry("640x640")
        self.config_obj = config
        self.ao_salvar = ao_salvar
        self._vars: dict[str, tk.StringVar] = {}

        # Data da inspeção: se ainda não informada, sugere a de hoje.
        if not config.data_inspecao:
            config.data_inspecao = datetime.date.today().strftime("%d/%m/%Y")

        # Modal: mantém a janela sempre à frente da tela principal (evita que
        # "suma" atrás ao usar o seletor de arquivos).
        self.transient(pai)

        _cabecalho(self, "Configuração — preencha uma vez")
        container, interno = _frame_rolavel(self)
        container.pack(fill="both", expand=True)

        for titulo, campos in GRUPOS_CONFIG:
            self._grupo(interno, titulo)
            for attr, rotulo in campos:
                self._campo_texto(interno, attr, rotulo)

        self._grupo(interno, "Imagens (arquivos fornecidos pelo usuário)")
        for attr, rotulo in CAMPOS_IMAGEM:
            self._campo_arquivo(interno, attr, rotulo)

        rodape = tk.Frame(self, bg=BRANCO)
        rodape.pack(fill="x", side="bottom")
        self.btn_salvar = tk.Button(
            rodape, text="Salvar", bg=LARANJA, fg=BRANCO,
            font=("Segoe UI", 10, "bold"), relief="flat", padx=20, pady=8,
            state="disabled", command=self._salvar)
        self.btn_salvar.pack(side="right", padx=12, pady=10)
        tk.Button(rodape, text="Cancelar", relief="flat", padx=16, pady=8,
                  command=self.destroy).pack(side="right", pady=10)

        # Só habilita "Salvar" quando todos os campos estiverem preenchidos.
        for var in self._vars.values():
            var.trace_add("write", self._validar)
        self._validar()

        self.grab_set()
        self.focus_force()

    def _validar(self, *_):
        if not hasattr(self, "btn_salvar"):
            return
        completo = all(v.get().strip() for v in self._vars.values())
        self.btn_salvar.config(state=("normal" if completo else "disabled"))

    def _grupo(self, pai, titulo):
        tk.Label(pai, text=titulo, bg=BRANCO, fg=LARANJA_FORTE,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=14, pady=(14, 2))

    def _campo_texto(self, pai, attr, rotulo):
        linha = tk.Frame(pai, bg=BRANCO)
        linha.pack(fill="x", padx=14, pady=2)
        tk.Label(linha, text=rotulo, bg=BRANCO, fg=GRAFITE, width=26,
                 anchor="w").pack(side="left")
        var = tk.StringVar(value=str(getattr(self.config_obj, attr, "")))
        self._vars[attr] = var
        tk.Entry(linha, textvariable=var).pack(side="left", fill="x", expand=True)

    def _campo_arquivo(self, pai, attr, rotulo):
        linha = tk.Frame(pai, bg=BRANCO)
        linha.pack(fill="x", padx=14, pady=2)
        tk.Label(linha, text=rotulo, bg=BRANCO, fg=GRAFITE, width=26,
                 anchor="w").pack(side="left")
        var = tk.StringVar(value=str(getattr(self.config_obj, attr, "")))
        self._vars[attr] = var
        tk.Entry(linha, textvariable=var).pack(side="left", fill="x", expand=True)

        def escolher():
            caminho = filedialog.askopenfilename(
                parent=self,
                title=rotulo,
                filetypes=[("Imagens", "*.png *.jpg *.jpeg"), ("Todos", "*.*")])
            # Reforça o foco de volta para esta janela após o seletor.
            self.lift()
            self.focus_force()
            if caminho:
                var.set(caminho)
        tk.Button(linha, text="…", command=escolher, relief="flat",
                  padx=8).pack(side="left", padx=4)

    def _salvar(self):
        for attr, var in self._vars.items():
            atual = getattr(self.config_obj, attr)
            valor = var.get()
            if isinstance(atual, float):
                try:
                    valor = float(valor.replace(",", "."))
                except ValueError:
                    valor = atual
            setattr(self.config_obj, attr, valor)
        try:
            salvar_config(self.config_obj)
        except Exception as e:  # pragma: no cover
            messagebox.showerror("Erro", f"Não foi possível salvar: {e}", parent=self)
            return
        if self.ao_salvar:
            self.ao_salvar(self.config_obj)
        messagebox.showinfo("Configuração", "Configuração salva.", parent=self)
        self.destroy()


# ---------------------------------------------------------------------------
# Resumo (somente leitura) das máquinas do pacote
# ---------------------------------------------------------------------------

LIMITE_ADEQUADO = 1000.0  # mΩ


def _fmt_num(v) -> str:
    if v is None:
        return "—"
    return f"{v:.1f}".rstrip("0").rstrip(".").replace(".", ",")


class LinhaResumo(tk.Frame):
    """Uma linha da tabela de resumo: os valores vêm prontos do pacote."""

    def __init__(self, pai, equipamento, indice):
        fundo = BRANCO if indice % 2 == 0 else "#fafafa"
        super().__init__(pai, bg=fundo)
        self.equipamento = equipamento

        valor = equipamento.valor_medido
        prol = equipamento.prolongador
        efetiva = None if valor is None else valor - (prol or 0)
        if efetiva is None:
            situacao, cor = "sem valor", CINZA
        elif efetiva <= LIMITE_ADEQUADO:
            situacao, cor = "ESTÁ", VERDE
        else:
            situacao, cor = "NÃO ESTÁ", VERMELHO

        colunas = [
            (equipamento.nome, 32, "w", GRAFITE),
            (equipamento.setor or "—", 22, "w", CINZA),
            (_fmt_num(valor), 10, "center", GRAFITE),
            (_fmt_num(prol), 10, "center", GRAFITE),
            (_fmt_num(efetiva), 10, "center", GRAFITE),
            (situacao, 10, "center", cor),
        ]
        for texto, larg, ancora, fg in colunas:
            tk.Label(self, text=texto, bg=fundo, fg=fg, width=larg,
                     anchor=ancora).pack(side="left", padx=2, pady=3)


# ---------------------------------------------------------------------------
# Aplicativo principal
# ---------------------------------------------------------------------------

class Aplicativo(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(TITULO_JANELA)
        self.geometry("980x720")
        self.configure(bg=BRANCO)
        self.config_obj = carregar_config()
        self.pacote = None
        self.linhas: list[LinhaMaquina] = []

        _cabecalho(self, TITULO)
        self._barra_acoes()
        self._area_conteudo()
        self._tela_inicial()

    def _barra_acoes(self):
        barra = tk.Frame(self, bg="#f3f4f6")
        barra.pack(fill="x")
        estilo = dict(bg=LARANJA, fg=BRANCO, font=("Segoe UI", 10, "bold"),
                      relief="flat", padx=16, pady=8,
                      activebackground=LARANJA_FORTE, activeforeground=BRANCO)
        tk.Button(barra, text="1 – Configurar relatórios", command=self._abrir_config,
                  **estilo).pack(side="left", padx=(8, 4), pady=8)
        tk.Button(barra, text="2 – Abrir pacote (.zip)", command=self._abrir_pacote,
                  **estilo).pack(side="left", padx=4, pady=8)
        self.btn_gerar = tk.Button(barra, text="3 – Gerar documentos",
                                   command=self._gerar, state="disabled", **estilo)
        self.btn_gerar.pack(side="left", padx=4, pady=8)

    def _area_conteudo(self):
        self.conteudo = tk.Frame(self, bg=BRANCO)
        self.conteudo.pack(fill="both", expand=True)

    def _limpar_conteudo(self):
        for w in self.conteudo.winfo_children():
            w.destroy()

    def _estilo_botao(self):
        return dict(bg=LARANJA, fg=BRANCO, font=("Segoe UI", 10, "bold"),
                    relief="flat", padx=16, pady=8,
                    activebackground=LARANJA_FORTE, activeforeground=BRANCO)

    def _tela_inicial(self):
        self._limpar_conteudo()
        # Botão "Sair" no canto inferior direito.
        rodape = tk.Frame(self.conteudo, bg=BRANCO)
        rodape.pack(side="bottom", fill="x")
        tk.Button(rodape, text="Sair", command=self._sair,
                  **self._estilo_botao()).pack(side="right", padx=12, pady=12)

        centro = tk.Frame(self.conteudo, bg=BRANCO)
        centro.pack(expand=True)
        # Logomarca da Nord Consult.
        try:
            from PIL import Image, ImageTk
            caminho = caminho_recurso("aterramento", "logo-nord.png")
            if os.path.exists(caminho):
                img = Image.open(caminho)
                img.thumbnail((360, 240))
                self._logo_ref = ImageTk.PhotoImage(img)
                tk.Label(centro, image=self._logo_ref, bg=BRANCO).pack(pady=(0, 18))
        except Exception:
            pass
        tk.Label(centro,
                 text="Abra o pacote .zip exportado pelo aplicativo de campo\n"
                      "para conferir as medições e gerar os relatórios.",
                 bg=BRANCO, fg=CINZA, font=("Segoe UI", 11),
                 justify="center").pack()

    def _abrir_config(self):
        JanelaConfig(self, self.config_obj,
                     ao_salvar=lambda c: setattr(self, "config_obj", c))

    def _abrir_pacote(self):
        caminho = filedialog.askopenfilename(
            title="Pacote da inspeção",
            filetypes=[("Pacote ZIP", "*.zip"), ("Todos", "*.*")])
        if not caminho:
            return
        try:
            if self.pacote:
                limparPacote(self.pacote)
            self.pacote = lerPacote(caminho)
        except Exception as e:
            messagebox.showerror("Erro ao ler o pacote", str(e))
            return
        self._tela_inspecao()

    def _tela_inspecao(self):
        """Resumo do pacote (somente leitura) — os valores já vêm no .zip."""
        self._limpar_conteudo()
        p = self.pacote

        cab = tk.Frame(self.conteudo, bg=BRANCO)
        cab.pack(fill="x", padx=16, pady=(10, 4))
        info = (f"Cliente: {p.cliente.nome or '—'}     "
                f"Inspetor: {p.inspecao.inspetor or '—'}     "
                f"Data da inspeção: {self.config_obj.data_inspecao or '—'}")
        tk.Label(cab, text=info, bg=BRANCO, fg=GRAFITE,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w")

        resumo = (f"{p.total} máquinas · {len(p.conformes)} conforme · "
                  f"{len(p.nao_conformes)} não conforme")
        linha_resumo = tk.Frame(self.conteudo, bg=BRANCO)
        linha_resumo.pack(fill="x", padx=16, pady=(0, 6))
        tk.Label(linha_resumo, text=resumo, bg=BRANCO, fg=CINZA).pack(side="left")
        self.var_pdf = tk.BooleanVar(value=False)
        tk.Checkbutton(linha_resumo, text="Gerar também em PDF",
                       variable=self.var_pdf, bg=BRANCO, fg=GRAFITE,
                       activebackground=BRANCO, selectcolor=BRANCO).pack(side="right")

        # Cabeçalho da tabela.
        cabtab = tk.Frame(self.conteudo, bg="#f3f4f6")
        cabtab.pack(fill="x", padx=14)
        for texto, larg, anc in [
                ("MÁQUINA/EQUIPAMENTO", 32, "w"), ("SETOR", 22, "w"),
                ("VALOR (mΩ)", 10, "center"), ("PROLONG.", 10, "center"),
                ("EFETIVA", 10, "center"), ("ADEQUADO?", 10, "center")]:
            tk.Label(cabtab, text=texto, bg="#f3f4f6", fg=GRAFITE, width=larg,
                     anchor=anc, font=("Segoe UI", 8, "bold")).pack(
                         side="left", padx=2, pady=4)

        container, interno = _frame_rolavel(self.conteudo)
        container.pack(fill="both", expand=True, padx=14, pady=(0, 8))
        self.linhas = []
        for i, eq in enumerate(p.equipamentos):
            linha = LinhaResumo(interno, eq, i)
            linha.pack(fill="x")
            self.linhas.append(linha)

        tk.Label(self.conteudo,
                 text="Os valores acima vêm do pacote. Clique em "
                      "\"3 – Gerar documentos\" para produzir os relatórios.",
                 bg=BRANCO, fg=CINZA, font=("Segoe UI", 9)).pack(pady=(0, 8))

        self.btn_gerar.config(state="normal")

    def _data_medicoes(self):
        # A data vem da Configuração e é usada em todos os documentos.
        texto = (self.config_obj.data_inspecao or "").strip()
        for fmt in ("%d/%m/%Y", "%d/%m/%y"):
            try:
                return datetime.datetime.strptime(texto, fmt).date()
            except ValueError:
                continue
        d = self.pacote.data_inspecao if self.pacote else None
        return d.date() if d else datetime.date.today()

    def _gerar(self):
        # Os valores vêm prontos do pacote (.zip).
        medicoes = {}
        sem_valor = []
        for eq in self.pacote.equipamentos:
            if eq.valor_medido is None:
                sem_valor.append(eq.nome)
                continue
            medicoes[eq.chave] = {"valor": eq.valor_medido,
                                  "prolongador": eq.prolongador}
        if not medicoes:
            messagebox.showwarning(
                "Sem valores",
                "Nenhuma máquina do pacote tem valor medido. Verifique se o "
                "pacote foi exportado por uma versão do aplicativo de campo "
                "que grava o valor medido.")
            return
        if sem_valor:
            ok = messagebox.askyesno(
                "Máquinas sem valor",
                "Estas máquinas não têm valor medido no pacote (não entram nos "
                "laudos individuais e ficam em branco na planilha):\n\n- "
                + "\n- ".join(sem_valor) + "\n\nContinuar?")
            if not ok:
                return

        pasta = filedialog.askdirectory(
            title="Escolha a pasta para salvar os laudos e planilha")
        if not pasta:
            return

        self.btn_gerar.config(state="disabled", text="Gerando…")
        self.update_idletasks()

        gerar_pdf = bool(getattr(self, "var_pdf", None) and self.var_pdf.get())
        self._pdf_solicitado = gerar_pdf

        def tarefa():
            try:
                res = gerar_todos(self.pacote, self.config_obj,
                                  self._data_medicoes(), medicoes, pasta,
                                  gerar_pdf=gerar_pdf)
                self.after(0, lambda: self._concluido(res))
            except Exception as e:
                self.after(0, lambda: self._erro(e))

        threading.Thread(target=tarefa, daemon=True).start()

    def _concluido(self, res):
        self.btn_gerar.config(state="normal", text="3 – Gerar documentos")
        self._dialogo_concluido(res)

    def _dialogo_concluido(self, res):
        n = len(res["individuais"])
        n_pdf = len(res.get("pdfs", []))
        if n_pdf:
            pdf_linha = f"• {n_pdf} PDF(s)\n"
        elif getattr(self, "_pdf_solicitado", False):
            pdf_linha = ("• PDF: NÃO gerado — instale o LibreOffice (gratuito) ou\n"
                         "  o Word/Excel + 'pip install pywin32'. Os arquivos\n"
                         "  Word/Excel foram gerados normalmente.\n")
        else:
            pdf_linha = ""
        dlg = tk.Toplevel(self)
        dlg.title("Concluído")
        dlg.transient(self)
        dlg.grab_set()
        dlg.configure(bg=BRANCO)
        _cabecalho(dlg, "Relatórios gerados")
        tk.Label(dlg, bg=BRANCO, fg=GRAFITE, justify="left", padx=20, pady=16,
                 font=("Segoe UI", 10),
                 text=(f"Documentos gerados em:\n{res['pasta']}\n\n"
                       f"• Planilha resumo\n• Laudo geral\n"
                       f"• {n} laudo(s) individual(is)\n{pdf_linha}\n"
                       "O que deseja fazer agora?")).pack(anchor="w")
        botoes = tk.Frame(dlg, bg=BRANCO)
        botoes.pack(fill="x", padx=16, pady=(0, 16))

        def gerar_mais():
            dlg.destroy()
            self._reiniciar()

        def sair():
            dlg.destroy()
            self._sair()

        tk.Button(botoes, text="Abrir pasta",
                  command=lambda: self._abrir_pasta(res["pasta"]),
                  **self._estilo_botao()).pack(side="left", padx=(0, 6))
        tk.Button(botoes, text="Gerar mais relatórios", command=gerar_mais,
                  **self._estilo_botao()).pack(side="left", padx=6)
        tk.Button(botoes, text="Encerrar programa", command=sair,
                  **self._estilo_botao()).pack(side="right")
        dlg.focus_force()

    def _reiniciar(self):
        """Volta à tela inicial para processar um novo pacote."""
        if self.pacote:
            limparPacote(self.pacote)
            self.pacote = None
        self.linhas = []
        self.btn_gerar.config(state="disabled")
        self._tela_inicial()

    def _sair(self):
        if self.pacote:
            limparPacote(self.pacote)
        self.destroy()

    def _erro(self, e):
        self.btn_gerar.config(state="normal", text="3 – Gerar documentos")
        messagebox.showerror("Erro ao gerar", str(e))

    @staticmethod
    def _abrir_pasta(pasta):
        try:
            if os.name == "nt":
                os.startfile(pasta)  # type: ignore[attr-defined]
            elif sys.platform == "darwin":
                os.system(f'open "{pasta}"')
            else:
                os.system(f'xdg-open "{pasta}"')
        except Exception:
            pass


def main():
    app = Aplicativo()
    app.mainloop()


if __name__ == "__main__":
    main()
