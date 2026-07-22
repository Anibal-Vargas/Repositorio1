"""Modelo de dados de uma inspeção de continuidade de aterramento.

Estas estruturas representam o conteúdo de um pacote .zip exportado pelo PWA
"Medição de continuidade de aterramento elétrico de máquinas e equipamentos".
Os nomes de campos e métodos ficam em português, seguindo a identidade do
projeto.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re


@dataclass
class Cliente:
    id: int | None = None
    nome: str = ""
    criadoEm: int | None = None


@dataclass
class Inspecao:
    id: int | None = None
    clienteId: int | None = None
    inspetor: str = ""
    observacoes: str = ""
    status: str = ""  # "em-andamento" | "finalizada"
    criadaEm: int | None = None


@dataclass
class Equipamento:
    """Uma máquina/equipamento registrado na inspeção."""

    id: int | None = None
    nome: str = ""              # ex.: "01 - Prensa hidráulica PH-01"
    setor: str = ""            # ex.: "Estamparia"
    pasta: str = ""            # caminho dentro do zip, ex.: "Fotos/01 - Prensa..."
    resultado_medicao: str | None = None  # "Conforme" | "Não conforme" | None
    observacao: str = ""
    # Fotos por categoria -> caminhos absolutos no disco (após extração).
    fotos: dict[str, list[str]] = field(default_factory=dict)
    # Áudios -> caminhos absolutos no disco.
    audios: list[str] = field(default_factory=list)

    # --- Propriedades derivadas -------------------------------------------

    @property
    def numero(self) -> int | None:
        """Número sequencial extraído do prefixo "NN - " do nome, se houver."""
        m = re.match(r"\s*(\d+)\s*-\s*", self.nome)
        return int(m.group(1)) if m else None

    @property
    def nome_sem_numero(self) -> str:
        """Nome sem o prefixo "NN - " (para exibição limpa quando desejado)."""
        return re.sub(r"^\s*\d+\s*-\s*", "", self.nome).strip()

    @property
    def conforme(self) -> bool | None:
        """True se Conforme, False se Não conforme, None se não medido."""
        if self.resultado_medicao is None:
            return None
        return self.resultado_medicao.strip().lower() == "conforme"

    @property
    def fotos_maquina(self) -> list[str]:
        return self.fotos.get("maquina", [])

    @property
    def fotos_valor(self) -> list[str]:
        return self.fotos.get("valor", [])

    @property
    def fotos_prancheta(self) -> list[str]:
        return self.fotos.get("prancheta", [])

    @property
    def fotos_adicionais(self) -> list[str]:
        return self.fotos.get("adicional", [])

    @property
    def todas_as_fotos(self) -> list[str]:
        """Todas as fotos, na ordem: máquina, valor, prancheta, adicionais."""
        ordem = ("maquina", "valor", "prancheta", "adicional")
        resultado: list[str] = []
        for categoria in ordem:
            resultado.extend(self.fotos.get(categoria, []))
        # Inclui eventuais categorias desconhecidas ao final.
        for categoria, lista in self.fotos.items():
            if categoria not in ordem:
                resultado.extend(lista)
        return resultado

    @property
    def motivos_pendencia(self) -> list[str]:
        """Lista de itens obrigatórios faltando. Vazia = item completo (OK)."""
        motivos: list[str] = []
        if not self.fotos_maquina:
            motivos.append("foto da máquina (01)")
        if not self.fotos_valor:
            motivos.append("foto do valor medido (02)")
        if self.resultado_medicao is None:
            motivos.append("resultado da medição")
        return motivos

    @property
    def pendente(self) -> bool:
        """Uma máquina é 'OK' com fotos 01 e 02 e o resultado marcado."""
        return bool(self.motivos_pendencia)


@dataclass
class Pacote:
    """Conteúdo completo de um pacote .zip de inspeção, já lido."""

    cliente: Cliente
    inspecao: Inspecao
    equipamentos: list[Equipamento]
    aplicativo: str = ""
    exportado_em: str = ""
    # Diretório temporário onde o zip foi extraído (para acessar fotos/áudios).
    diretorio: str | None = None
    # Origem dos dados: "dados.json" ou "pastas" (varredura de Fotos/).
    origem: str = "dados.json"

    # --- Agregações úteis para os relatórios ------------------------------

    @property
    def total(self) -> int:
        return len(self.equipamentos)

    @property
    def conformes(self) -> list[Equipamento]:
        return [e for e in self.equipamentos if e.conforme is True]

    @property
    def nao_conformes(self) -> list[Equipamento]:
        return [e for e in self.equipamentos if e.conforme is False]

    @property
    def pendentes(self) -> list[Equipamento]:
        return [e for e in self.equipamentos if e.pendente]

    def por_setor(self) -> dict[str, list[Equipamento]]:
        """Equipamentos agrupados por setor, preservando a ordem de aparição."""
        grupos: dict[str, list[Equipamento]] = {}
        for e in self.equipamentos:
            grupos.setdefault(e.setor or "Sem setor", []).append(e)
        return grupos

    @property
    def data_inspecao(self) -> datetime | None:
        """Data da inspeção a partir de inspecao.criadaEm (epoch ms)."""
        if not self.inspecao.criadaEm:
            return None
        return datetime.fromtimestamp(self.inspecao.criadaEm / 1000, tz=timezone.utc)
