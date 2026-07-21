// Checklist de medição de continuidade de um equipamento na inspeção.

import { el, cabecalho, toast, debounce } from '../ui.js';
import {
  obterInspecao,
  obterEquipamento,
  listarMedicoes,
  atualizarMedicao,
  removerEquipamentoDaInspecao,
  contarFotos,
  LIMITE_OHMS,
} from '../db.js';

export async function telaChecklist(inspecaoId, equipamentoId) {
  const inspecao = await obterInspecao(inspecaoId);
  const equipamento = await obterEquipamento(equipamentoId);
  if (!inspecao || !equipamento) {
    toast('Equipamento não encontrado nesta inspeção.');
    location.hash = `#/inspecao/${inspecaoId}`;
    return [];
  }
  const medicoes = await listarMedicoes(inspecaoId, equipamentoId);
  const fotos = await contarFotos(inspecaoId, equipamentoId);
  const somenteLeitura = inspecao.status === 'finalizada';

  function montarItem(medicao) {
    const botoes = {
      conforme: el('button', { class: 'btn-opcao' }, 'Conforme'),
      nc: el('button', { class: 'btn-opcao' }, 'Não conforme'),
      na: el('button', { class: 'btn-opcao' }, 'N/A'),
    };

    function pintar(resultado) {
      botoes.conforme.classList.toggle('sel-conforme', resultado === 'conforme');
      botoes.nc.classList.toggle('sel-nc', resultado === 'nc');
      botoes.na.classList.toggle('sel-na', resultado === 'na');
    }
    pintar(medicao.resultado);

    for (const [resultado, botao] of Object.entries(botoes)) {
      botao.addEventListener('click', async () => {
        if (somenteLeitura) {
          toast('Inspeção finalizada — somente leitura.');
          return;
        }
        const novo = medicao.resultado === resultado ? null : resultado;
        medicao.resultado = novo;
        await atualizarMedicao(medicao.id, { resultado: novo });
        pintar(novo);
        toast('Salvo.');
      });
    }

    const salvarValor = debounce(async (valor) => {
      await atualizarMedicao(medicao.id, { valorOhms: valor });
      toast('Salvo.');
    }, 500);

    const salvarObservacao = debounce(async (valor) => {
      await atualizarMedicao(medicao.id, { observacao: valor });
      toast('Salvo.');
    }, 600);

    return el(
      'div',
      { class: 'item-checklist' },
      el('div', { class: 'descricao' }, medicao.descricao),
      medicao.temMedicao
        ? el(
            'div',
            { class: 'campo-medicao' },
            el('input', {
              type: 'number',
              step: '0.001',
              min: '0',
              inputmode: 'decimal',
              placeholder: `Valor medido (limite ${String(LIMITE_OHMS).replace('.', ',')} Ω)`,
              value: medicao.valorOhms || null,
              disabled: somenteLeitura,
              oninput: (evento) => salvarValor(evento.target.value),
            }),
            el('span', { class: 'unidade' }, 'Ω')
          )
        : null,
      el('div', { class: 'opcoes-status' }, botoes.conforme, botoes.nc, botoes.na),
      el(
        'input',
        {
          type: 'text',
          placeholder: 'Observação (opcional)',
          value: medicao.observacao || null,
          disabled: somenteLeitura,
          oninput: (evento) => salvarObservacao(evento.target.value),
        }
      )
    );
  }

  async function removerDaInspecao() {
    if (
      !confirm(
        'Remover este equipamento da inspeção? As medições e fotos dele nesta inspeção serão apagadas.'
      )
    )
      return;
    await removerEquipamentoDaInspecao(inspecaoId, equipamentoId);
    toast('Equipamento removido da inspeção.');
    location.hash = `#/inspecao/${inspecaoId}`;
  }

  return [
    cabecalho(equipamento.nome, {
      voltar: `#/inspecao/${inspecaoId}`,
      subtitulo: equipamento.setor || 'Checklist de continuidade de aterramento',
    }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Pontos de verificação'),
      el('div', { class: 'lista' }, medicoes.map(montarItem)),
      el(
        'a',
        {
          class: 'btn btn-secundario',
          href: `#/inspecao/${inspecaoId}/equipamento/${equipamentoId}/fotos`,
        },
        `Fotos (${fotos})`
      ),
      !somenteLeitura
        ? el(
            'button',
            { class: 'btn btn-discreto', onclick: removerDaInspecao },
            'Remover equipamento desta inspeção'
          )
        : null
    ),
  ];
}
