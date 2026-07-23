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
    ]),
    ("Empresa responsável (Nord)", [
        ("engenheiro", "Engenheiro responsável"),
        ("crea", "CREA"),
    ]),
    ("Contratante", [
        ("contratante_nome", "Nome do contratante"),
        ("contratante_endereco", "Endereço"),
        ("contratante_cep", "CEP"),
        ("contratante_fone", "Telefone"),
        ("contratante_email", "E-mail"),
        ("contratante_cnpj", "CNPJ"),
        ("contratante_descricao", "Descrição (texto de objetivos)"),
    ]),
    ("Capa — laudo geral", [
        ("capa_linha_razao", "Razão social (linha 1)"),
        ("capa_linha_unidade", "Unidade (linha 2)"),
        ("capa_linha_local", "Local (linha 3)"),
        ("proposta", "Nº da proposta"),
        ("cidade", "Cidade (dateline)"),
    ]),
    ("Capa — laudo individual", [
        ("capa_ind_local", "Local (título)"),
        ("capa_ind_unidade", "Unidade"),
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
# Linha de uma máquina (na inspeção)
# ---------------------------------------------------------------------------

class LinhaMaquina(tk.Frame):
    def __init__(self, pai, equipamento, config):
        super().__init__(pai, bg=BRANCO, highlightbackground="#e5e7eb",
                         highlightthickness=1)
        self.equipamento = equipamento
        self._imgref = None  # mantém referência da PhotoImage

        esq = tk.Frame(self, bg=BRANCO)
        esq.pack(side="left", padx=8, pady=8)
        self._mostrar_display(esq, equipamento)

        dir_ = tk.Frame(self, bg=BRANCO)
        dir_.pack(side="left", fill="both", expand=True, padx=8, pady=8)

        estado = "Pendente" if equipamento.pendente else (
            equipamento.resultado_medicao or "—")
        cor = VERMELHO if equipamento.pendente else (
            VERDE if equipamento.conforme else (VERMELHO if equipamento.conforme is False else CINZA))
        tk.Label(dir_, text=equipamento.nome, bg=BRANCO, fg=GRAFITE,
                 font=("Segoe UI", 10, "bold")).pack(anchor="w")
        tk.Label(dir_, text=f"Setor: {equipamento.setor or '—'}   ·   PWA: {estado}",
                 bg=BRANCO, fg=cor).pack(anchor="w")

        form = tk.Frame(dir_, bg=BRANCO)
        form.pack(anchor="w", pady=4)
        tk.Label(form, text="Valor medido (mΩ):", bg=BRANCO, fg=GRAFITE).grid(
            row=0, column=0, sticky="w")
        self.var_valor = tk.StringVar()
        tk.Entry(form, textvariable=self.var_valor, width=10).grid(
            row=0, column=1, padx=4)
        tk.Label(form, text="Prolongador (mΩ):", bg=BRANCO, fg=GRAFITE).grid(
            row=0, column=2, sticky="w", padx=(12, 0))
        self.var_prol = tk.StringVar(
            value=("" if equipamento.prolongador is None
                   else str(equipamento.prolongador).replace(".", ",")))
        tk.Entry(form, textvariable=self.var_prol, width=8).grid(
            row=0, column=3, padx=4)

        # Sugestão de OCR (apenas informativa; nunca preenche sozinha).
        self._sugestao_ocr(dir_, equipamento)

    def _foto_valor(self):
        f = self.equipamento.fotos_valor
        return f[0] if f else None

    def _mostrar_display(self, pai, equipamento):
        from PIL import Image, ImageTk
        caminho = self._foto_valor()
        img = None
        if caminho and os.path.exists(caminho):
            try:
                from . import ocr
                crop = ocr.localizarDisplay(caminho)
                if crop is not None:
                    img = Image.fromarray(crop[:, :, ::-1])  # BGR->RGB
            except Exception:
                img = None
            if img is None:
                try:
                    img = Image.open(caminho)
                except Exception:
                    img = None
        if img is None:
            tk.Label(pai, text="(sem foto 02)", bg="#f3f4f6", fg=CINZA,
                     width=30, height=6).pack()
            return
        img.thumbnail((320, 200))
        foto = ImageTk.PhotoImage(img)
        self._imgref = foto
        tk.Label(pai, image=foto, bg=BRANCO).pack()
        tk.Label(pai, text="foto 02 — valor medido", bg=BRANCO, fg=CINZA,
                 font=("Segoe UI", 8)).pack()

    def _sugestao_ocr(self, pai, equipamento):
        caminho = self._foto_valor()
        if not caminho or not os.path.exists(caminho):
            return
        try:
            from . import ocr
            if not ocr.DISPONIVEL:
                return
            r = ocr.lerValor(caminho)
            if r.texto:
                tk.Label(pai, text=f"Sugestão OCR (confira): {r.texto}",
                         bg=BRANCO, fg=CINZA, font=("Segoe UI", 8, "italic")
                         ).pack(anchor="w")
        except Exception:
            pass

    def valor(self):
        t = self.var_valor.get().strip().replace(",", ".")
        try:
            return float(t)
        except ValueError:
            return None

    def prolongador(self):
        t = self.var_prol.get().strip().replace(",", ".")
        try:
            return float(t)
        except ValueError:
            return None


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
        tk.Button(barra, text="Configuração", command=self._abrir_config,
                  **estilo).pack(side="left", padx=(8, 4), pady=8)
        tk.Button(barra, text="Abrir pacote (.zip)", command=self._abrir_pacote,
                  **estilo).pack(side="left", padx=4, pady=8)
        self.btn_gerar = tk.Button(barra, text="Gerar documentos",
                                   command=self._gerar, state="disabled", **estilo)
        self.btn_gerar.pack(side="left", padx=4, pady=8)

    def _area_conteudo(self):
        self.conteudo = tk.Frame(self, bg=BRANCO)
        self.conteudo.pack(fill="both", expand=True)

    def _limpar_conteudo(self):
        for w in self.conteudo.winfo_children():
            w.destroy()

    def _tela_inicial(self):
        self._limpar_conteudo()
        centro = tk.Frame(self.conteudo, bg=BRANCO)
        centro.pack(expand=True)
        # Logomarca da Nord Consult.
        try:
            from PIL import Image, ImageTk
            caminho = os.path.join(os.path.dirname(__file__), "logo-nord.png")
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
        self._limpar_conteudo()
        p = self.pacote

        cab = tk.Frame(self.conteudo, bg=BRANCO)
        cab.pack(fill="x", padx=12, pady=8)
        self.var_cliente = tk.StringVar(value=p.cliente.nome or "")
        self.var_inspetor = tk.StringVar(value=p.inspecao.inspetor or "")
        for i, (rot, var, larg) in enumerate([
                ("Cliente", self.var_cliente, 28),
                ("Inspetor", self.var_inspetor, 22)]):
            tk.Label(cab, text=rot + ":", bg=BRANCO, fg=GRAFITE).grid(
                row=0, column=i * 2, sticky="w", padx=(8, 2))
            tk.Entry(cab, textvariable=var, width=larg).grid(
                row=0, column=i * 2 + 1, padx=(0, 8))
        tk.Label(cab, text=f"Data da inspeção: {self.config_obj.data_inspecao or '—'} "
                          "(definida na Configuração)",
                 bg=BRANCO, fg=CINZA).grid(row=0, column=4, sticky="w", padx=(12, 0))

        resumo = (f"{p.total} máquinas · {len(p.conformes)} conforme · "
                  f"{len(p.nao_conformes)} não conforme · {len(p.pendentes)} pendente(s)")
        tk.Label(self.conteudo, text=resumo, bg=BRANCO, fg=CINZA).pack(anchor="w", padx=16)

        container, interno = _frame_rolavel(self.conteudo)
        container.pack(fill="both", expand=True, padx=8, pady=8)
        self.linhas = []
        for eq in p.equipamentos:
            linha = LinhaMaquina(interno, eq, self.config_obj)
            linha.pack(fill="x", padx=6, pady=4)
            self.linhas.append(linha)

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
        # Monta as medições a partir dos campos.
        medicoes = {}
        sem_valor = []
        for linha in self.linhas:
            v = linha.valor()
            if v is None:
                sem_valor.append(linha.equipamento.nome)
                continue
            medicoes[linha.equipamento.chave] = {
                "valor": v, "prolongador": linha.prolongador()}
        if not medicoes:
            messagebox.showwarning(
                "Sem valores", "Informe o valor medido de ao menos uma máquina.")
            return
        if sem_valor:
            ok = messagebox.askyesno(
                "Máquinas sem valor",
                "Estas máquinas ficarão sem valor (não entram nos laudos "
                "individuais e ficam em branco na planilha):\n\n- "
                + "\n- ".join(sem_valor) + "\n\nContinuar?")
            if not ok:
                return

        pasta = filedialog.askdirectory(
            title="Escolha a pasta para salvar os laudos e planilha")
        if not pasta:
            return

        # Atualiza cliente/inspetor conforme editado.
        self.pacote.cliente.nome = self.var_cliente.get().strip()
        self.pacote.inspecao.inspetor = self.var_inspetor.get().strip()

        self.btn_gerar.config(state="disabled", text="Gerando…")
        self.update_idletasks()

        def tarefa():
            try:
                res = gerar_todos(self.pacote, self.config_obj,
                                  self._data_medicoes(), medicoes, pasta)
                self.after(0, lambda: self._concluido(res))
            except Exception as e:
                self.after(0, lambda: self._erro(e))

        threading.Thread(target=tarefa, daemon=True).start()

    def _concluido(self, res):
        self.btn_gerar.config(state="normal", text="Gerar documentos")
        n = len(res["individuais"])
        if messagebox.askyesno(
                "Concluído",
                f"Documentos gerados em:\n{res['pasta']}\n\n"
                f"Planilha resumo, laudo geral e {n} laudo(s) individual(is).\n\n"
                "Abrir a pasta?"):
            self._abrir_pasta(res["pasta"])

    def _erro(self, e):
        self.btn_gerar.config(state="normal", text="Gerar documentos")
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
