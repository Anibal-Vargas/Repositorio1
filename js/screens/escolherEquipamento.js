// Escolher (ou criar) uma máquina/equipamento do cliente para incluir na inspeção.

import { el, cabecalho, toast } from '../ui.js';
import {
  obterInspecao,
  listarEquipamentos,
  criarEquipamento,
  incluirEquipamentoNaInspecao,
  equipamentosDaInspecao,
} from '../db.js';

export async function telaEscolherEquipamento(inspecaoId) {
  const inspecao = await obterInspecao(inspecaoId);
  if (!inspecao) {
    toast('Inspeção não encontrada.');
    location.hash = '#/inspecoes';
    return [];
  }
  const equipamentos = await listarEquipamentos(inspecao.clienteId);
  const jaIncluidos = new Set((await equipamentosDaInspecao(inspecaoId)).map((e) => e.id));

  async function incluir(equipamentoId) {
    const incluiu = await incluirEquipamentoNaInspecao(inspecaoId, equipamentoId);
    if (incluiu) toast('Máquina/equipamento incluída.');
    location.hash = `#/inspecao/${inspecaoId}/equipamento/${equipamentoId}`;
  }

  const campoNome = el('input', {
    type: 'text',
    placeholder: 'Nome/TAG da máquina/equipamento',
    autocomplete: 'off',
  });
  const campoSetor = el('input', {
    type: 'text',
    placeholder: 'Setor (opcional)',
    autocomplete: 'off',
  });

  async function criarEIncluir() {
    const nome = campoNome.value.trim();
    if (!nome) {
      toast('Informe o nome da máquina/equipamento.');
      campoNome.focus();
      return;
    }
    const equipamentoId = await criarEquipamento(inspecao.clienteId, nome, campoSetor.value);
    toast('Máquina/equipamento criada.');
    await incluir(equipamentoId);
  }

  return [
    cabecalho('Escolher máquina/equipamento', { voltar: `#/inspecao/${inspecaoId}` }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Máquinas/Equipamentos do cliente'),
      equipamentos.length === 0
        ? el(
            'div',
            { class: 'vazio' },
            'Nenhuma máquina/equipamento cadastrada. Crie a primeira abaixo.'
          )
        : el(
            'div',
            { class: 'lista' },
            equipamentos.map((equipamento) =>
              el(
                'button',
                { class: 'cartao', onclick: () => incluir(equipamento.id) },
                el(
                  'div',
                  { class: 'principal' },
                  el('div', { class: 'titulo' }, equipamento.nome),
                  equipamento.setor ? el('div', { class: 'detalhe' }, equipamento.setor) : null
                ),
                jaIncluidos.has(equipamento.id)
                  ? el('span', { class: 'selo selo-verde' }, 'Na inspeção')
                  : null,
                el('span', { class: 'seta' }, '›')
              )
            )
          ),
      el('h2', {}, 'Nova máquina/equipamento'),
      campoNome,
      el(
        'div',
        { class: 'linha-form' },
        campoSetor,
        el('button', { class: 'btn btn-secundario', onclick: criarEIncluir }, '+ Criar')
      )
    ),
  ];
}
