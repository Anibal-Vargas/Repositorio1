// Detalhe da inspeção: dados gerais, equipamentos incluídos e exportação.

import { el, cabecalho, toast, formatarDataHora, debounce } from '../ui.js';
import {
  obterInspecao,
  obterCliente,
  atualizarInspecao,
  excluirInspecao,
  equipamentosDaInspecao,
  resumoDoEquipamento,
  contarFotos,
} from '../db.js';

export async function telaInspecao(inspecaoId) {
  const inspecao = await obterInspecao(inspecaoId);
  if (!inspecao) {
    toast('Inspeção não encontrada.');
    location.hash = '#/inspecoes';
    return [];
  }
  const cliente = await obterCliente(inspecao.clienteId);
  const equipamentos = await equipamentosDaInspecao(inspecaoId);
  const finalizada = inspecao.status === 'finalizada';

  const cartoesEquipamentos = [];
  for (const equipamento of equipamentos) {
    const resumo = await resumoDoEquipamento(inspecaoId, equipamento.id);
    const fotos = await contarFotos(inspecaoId, equipamento.id);
    cartoesEquipamentos.push(
      el(
        'a',
        { class: 'cartao', href: `#/inspecao/${inspecaoId}/equipamento/${equipamento.id}` },
        el(
          'div',
          { class: 'principal' },
          el('div', { class: 'titulo' }, equipamento.nome),
          el(
            'div',
            { class: 'detalhe' },
            `${resumo.respondidas}/${resumo.total} itens · ${fotos} foto(s)` +
              (equipamento.setor ? ` · ${equipamento.setor}` : '')
          )
        ),
        resumo.nc > 0 ? el('span', { class: 'selo selo-vermelho' }, `${resumo.nc} NC`) : null,
        resumo.nc === 0 && resumo.respondidas === resumo.total && resumo.total > 0
          ? el('span', { class: 'selo selo-verde' }, 'OK')
          : null,
        el('span', { class: 'seta' }, '›')
      )
    );
  }

  const salvarObservacoes = debounce(async (valor) => {
    await atualizarInspecao(inspecaoId, { observacoes: valor });
    toast('Salvo.');
  }, 600);

  const campoObservacoes = el(
    'textarea',
    {
      placeholder: 'Observações gerais da inspeção…',
      oninput: (evento) => salvarObservacoes(evento.target.value),
      disabled: finalizada,
    },
    inspecao.observacoes || ''
  );

  async function alternarStatus() {
    if (!finalizada) {
      const pendentes = [];
      for (const equipamento of equipamentos) {
        const resumo = await resumoDoEquipamento(inspecaoId, equipamento.id);
        if (resumo.respondidas < resumo.total) pendentes.push(equipamento.nome);
      }
      let mensagem = 'Finalizar esta inspeção? Depois de finalizada ela fica somente leitura.';
      if (pendentes.length > 0) {
        mensagem = `Ainda há itens sem resposta em: ${pendentes.join(', ')}. ${mensagem}`;
      }
      if (!confirm(mensagem)) return;
      await atualizarInspecao(inspecaoId, { status: 'finalizada' });
      toast('Inspeção finalizada.');
    } else {
      await atualizarInspecao(inspecaoId, { status: 'em-andamento' });
      toast('Inspeção reaberta.');
    }
    location.reload();
  }

  async function excluir() {
    if (
      !confirm(
        'Excluir esta inspeção? Todas as medições e fotos dela serão apagadas. Esta ação não pode ser desfeita.'
      )
    )
      return;
    await excluirInspecao(inspecaoId);
    toast('Inspeção excluída.');
    location.hash = '#/inspecoes';
  }

  return [
    cabecalho(cliente ? cliente.nome : 'Inspeção', {
      voltar: '#/inspecoes',
      subtitulo: `Inspeção de ${formatarDataHora(inspecao.criadaEm)}` +
        (inspecao.responsavel ? ` · ${inspecao.responsavel}` : ''),
    }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Equipamentos'),
      cartoesEquipamentos.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhum equipamento incluído ainda.')
        : el('div', { class: 'lista' }, cartoesEquipamentos),
      !finalizada
        ? el(
            'a',
            { class: 'btn btn-secundario', href: `#/inspecao/${inspecaoId}/equipamentos` },
            '+ Adicionar equipamento'
          )
        : null,
      el('h2', {}, 'Observações'),
      campoObservacoes,
      el('h2', {}, 'Ações'),
      el(
        'a',
        { class: 'btn btn-primario', href: `#/inspecao/${inspecaoId}/exportar` },
        'Exportar relatório'
      ),
      el(
        'button',
        { class: 'btn btn-secundario', onclick: alternarStatus },
        finalizada ? 'Reabrir inspeção' : 'Finalizar inspeção'
      ),
      el('button', { class: 'btn btn-discreto', onclick: excluir }, 'Excluir inspeção')
    ),
  ];
}
