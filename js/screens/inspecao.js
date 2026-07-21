// Detalhe da inspeção: dados gerais, máquinas/equipamentos incluídos e exportação.

import { el, cabecalho, toast, formatarDataHora, debounce } from '../ui.js';
import {
  obterInspecao,
  obterCliente,
  obterSetor,
  atualizarInspecao,
  excluirInspecao,
  equipamentosDaInspecao,
  resumoDoEquipamento,
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
    const setor = await obterSetor(equipamento.setorId);
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
            `${resumo.totalFotos} foto(s)` + (setor ? ` · ${setor.nome}` : '')
          )
        ),
        resumo.completo
          ? el('span', { class: 'selo selo-verde' }, 'OK')
          : el('span', { class: 'selo selo-vermelho' }, 'Pendente'),
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
        if (!resumo.completo) pendentes.push(`${equipamento.nome} (${resumo.pendentes.join(', ')})`);
      }
      let mensagem = 'Finalizar esta inspeção? Depois de finalizada ela fica somente leitura.';
      if (pendentes.length > 0) {
        mensagem = `Faltam itens obrigatórios em: ${pendentes.join('; ')}. ${mensagem}`;
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
        'Excluir esta inspeção? Todos os registros, fotos e áudios dela serão apagados. Esta ação não pode ser desfeita.'
      )
    )
      return;
    await excluirInspecao(inspecaoId);
    toast('Inspeção excluída.');
    location.hash = '#/inspecoes';
  }

  const inspetor = inspecao.inspetor || inspecao.responsavel || '';

  return [
    cabecalho(cliente ? cliente.nome : 'Inspeção', {
      voltar: '#/inspecoes',
      subtitulo:
        `Inspeção de ${formatarDataHora(inspecao.criadaEm)}` +
        (inspetor ? ` · Inspetor: ${inspetor}` : ''),
    }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Máquinas/Equipamentos'),
      cartoesEquipamentos.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhuma máquina/equipamento incluída ainda.')
        : el('div', { class: 'lista' }, cartoesEquipamentos),
      !finalizada
        ? el(
            'a',
            { class: 'btn btn-secundario', href: `#/inspecao/${inspecaoId}/equipamentos` },
            '+ Adicionar máquina/equipamento'
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
