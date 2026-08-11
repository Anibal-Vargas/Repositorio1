"""Configuração preenchida uma única vez (dados fixos dos laudos).

São os campos que não vêm no pacote .zip e que o usuário informa uma vez no
app, reutilizados em todas as inspeções: data da inspeção, unidade, cidade,
engenheiro responsável, imagens (logo do cliente, equipamento, selo) e as
datas do certificado de calibração.

Os valores padrão abaixo correspondem ao exemplo dos modelos, para o app já
abrir preenchido; o usuário ajusta e salva (arquivo JSON local).
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass


@dataclass
class Configuracao:
    # Data da inspeção (dd/mm/aaaa) — usada em todos os documentos.
    data_inspecao: str = ""

    # Unidade do cliente (capa dos laudos: "UNIDADE: ...").
    unidade: str = ""

    # Nº da proposta (cabeçalho dos relatórios: "Proposta - <nº>").
    proposta: str = ""

    # Cidade da assinatura ("<cidade>, <data por extenso>").
    cidade: str = "Chapecó – SC"

    # Engenheiro responsável (Nord).
    engenheiro: str = "Aníbal Rosa Vargas"
    crea: str = "069788-5"

    # Imagens fornecidas pelo usuário (caminhos de arquivo). Vazio = mantém a
    # imagem do modelo.
    logo_cliente: str = ""            # logomarca do cliente (capa e cabeçalhos)
    imagem_equipamento: str = ""      # foto do miliohmímetro (Figura 1)
    imagem_selo_calibracao: str = ""  # selo/certificado de calibração

    # Instrumento de medição (usado apenas nos laudos individuais).
    instrumento: str = "miliohmímetro"   # "miliohmímetro" ou "microhmímetro"
    instrumento_modelo: str = "MILLIOHM 1"
    instrumento_fabricante: str = "Instrument"
    instrumento_corrente: str = "1,2 A"       # "1,2 A" ou "10 A"

    # Datas do certificado de calibração.
    calibracao_data: str = "30/03/2026"       # data de aferição/emissão
    calibracao_validade: str = "30/03/2027"   # validade do certificado

    # Resistência do prolongador padrão (mΩ) quando o pacote não trouxer.
    prolongador_padrao: float = 0.8

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
