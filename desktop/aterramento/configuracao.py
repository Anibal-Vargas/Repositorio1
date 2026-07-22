"""Configuração preenchida uma única vez (dados fixos dos laudos).

São os campos que não vêm no pacote .zip e que o usuário informa uma vez no
app, reutilizados em todas as inspeções: empresa responsável (Nord),
engenheiro, e dados do contratante / proposta / cidade.

Os valores padrão abaixo correspondem ao exemplo dos modelos enviados, para o
app já abrir preenchido; o usuário ajusta e salva (arquivo JSON local).
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass


@dataclass
class Configuracao:
    # Empresa responsável pelas medições (Nord) e engenheiro.
    engenheiro: str = "Aníbal Rosa Vargas"
    crea: str = "069788-5"

    # Contratante (bloco "empresa contratante" e capa dos laudos).
    contratante_nome: str = "Cooperativa Central Oeste Catarinense - Incubatório"
    contratante_endereco: str = "RS - Rua Virgínio Basso, 13 - Ibiaçá, RS"
    contratante_cep: str = "RS, 99940-000"
    contratante_fone: str = "(54) 9 144-5768"
    contratante_email: str = "daiane-almeida@auroracoop.com.br"
    contratante_cnpj: str = "83.310.441/0099-20"
    # Descrição usada no texto de objetivos ("... na empresa <descricao>.").
    contratante_descricao: str = "Aurora, unidade Incubatório – Ibiaçá – Rs"

    # Capa (título do relatório) — linhas do contratante em caixa alta.
    capa_linha_razao: str = "COOPERATIVA CENTRAL AURORA ALIMENTOS"
    capa_linha_unidade: str = "UNIDADE CATARINENSE – INCUBATÓRIO"
    capa_linha_local: str = "IBIACÁ - RS"

    # Capa do laudo individual.
    capa_ind_local: str = "INCUBATÓRIO IBIAÇÁ - RS"          # linha do título
    capa_ind_unidade: str = "COOPERATIVA CENTRAL – INCUBATÓRIO IBIAÇÁ - RS"  # "UNIDADE: ..."

    # Proposta e cidade (para a capa "<cidade>, <data por extenso>").
    proposta: str = "018PC26AUR"
    cidade: str = "Chapecó - SC"

    # Resistência do prolongador padrão (mΩ) quando o pacote não trouxer.
    prolongador_padrao: float = 0.2

    def salvar(self, caminho: str) -> None:
        with open(caminho, "w", encoding="utf-8") as f:
            json.dump(asdict(self), f, ensure_ascii=False, indent=2)

    @classmethod
    def carregar(cls, caminho: str) -> "Configuracao":
        if not os.path.exists(caminho):
            return cls()
        with open(caminho, encoding="utf-8") as f:
            dados = json.load(f)
        campos = set(cls.__dataclass_fields__)
        return cls(**{k: v for k, v in dados.items() if k in campos})
