"""Conferência da leitura de um pacote .zip (Etapa 1).

Uso:
    python conferir.py caminho/para/aterramento-....zip

Imprime, em texto, o que o leitor extraiu do pacote: cliente, inspeção,
equipamentos por setor, resultado de cada um e as pendências. Serve para
validar a leitura ANTES de gerar qualquer documento.
"""

from __future__ import annotations

import os
import sys

from aterramento import lerPacote, lerPasta, limparPacote


def _linha(texto: str = "", nivel: int = 0) -> None:
    print("  " * nivel + texto)


def conferir(caminho: str) -> None:
    # Aceita tanto um .zip quanto uma pasta já extraída.
    pacote = lerPasta(caminho) if os.path.isdir(caminho) else lerPacote(caminho)
    limpar = not os.path.isdir(caminho)
    try:
        _linha("=" * 68)
        _linha("Medição de continuidade de aterramento elétrico de máquinas e")
        _linha("equipamentos — Nord Consult Ltda.")
        _linha("=" * 68)
        _linha(f"Origem dos dados : {pacote.origem}")
        _linha(f"Aplicativo       : {pacote.aplicativo or '—'}")
        _linha(f"Cliente          : {pacote.cliente.nome or '—'}")
        data = pacote.data_inspecao
        _linha(f"Data da inspeção : {data.strftime('%d/%m/%Y') if data else '—'}")
        _linha(f"Inspetor         : {pacote.inspecao.inspetor or '—'}")
        _linha(f"Status           : {pacote.inspecao.status or '—'}")
        if pacote.inspecao.observacoes:
            _linha(f"Observações      : {pacote.inspecao.observacoes}")
        _linha()

        _linha("RESUMO")
        _linha(f"Total de máquinas/equipamentos : {pacote.total}", 1)
        _linha(f"Conforme                       : {len(pacote.conformes)}", 1)
        _linha(f"Não conforme                   : {len(pacote.nao_conformes)}", 1)
        _linha(f"Pendentes (incompletas)        : {len(pacote.pendentes)}", 1)
        _linha()

        for setor, itens in pacote.por_setor().items():
            _linha(f"SETOR: {setor}")
            for e in itens:
                estado = "PENDENTE" if e.pendente else (e.resultado_medicao or "—")
                _linha(f"- {e.nome}  [{estado}]", 1)
                n_fotos = len(e.todas_as_fotos)
                _linha(
                    f"fotos: máquina={len(e.fotos_maquina)} valor={len(e.fotos_valor)} "
                    f"prancheta={len(e.fotos_prancheta)} adicionais={len(e.fotos_adicionais)} "
                    f"(total {n_fotos})",
                    2,
                )
                if e.prolongador is not None:
                    _linha(f"prolongador (PT): {e.prolongador} mΩ", 2)
                if e.audios:
                    _linha(f"áudios: {len(e.audios)}", 2)
                if e.observacao:
                    _linha(f"observação: {e.observacao}", 2)
                if e.pendente:
                    _linha(f"faltando: {', '.join(e.motivos_pendencia)}", 2)
            _linha()

        if pacote.pendentes:
            _linha("⚠  ATENÇÃO: há máquinas pendentes (itens obrigatórios faltando).")
            _linha("   Os relatórios sinalizarão essas pendências.")
    finally:
        if limpar:
            limparPacote(pacote)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python conferir.py caminho/para/pacote.zip  (ou pasta extraída)")
        sys.exit(1)
    conferir(sys.argv[1])
