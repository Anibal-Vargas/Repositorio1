// Fluxo de campo da inspeção em duas etapas:
// 1) escolher (ou criar) o setor; 2) registrar as máquinas/equipamentos do setor,
// uma após a outra, sem precisar reescolher o setor.

import { el, cabecalho, toast } from '../ui.js';
import {
  obterInspecao,
  listarSetores,
  obterSetor,
  criarSetor,
  listarEquipamentosDoSetor,
  criarEquipamento,
  incluirEquipamentoNaInspecao,
  equipamentosDaInspecao,
  resumoDoEquipamento,
} from '../db.js';

/* ---------- Etapa 1: escolher o setor ---------- */

export async function telaEscolherSetor(inspecaoId) {
  const inspecao = await obterInspecao(inspecaoId);
  if (!inspecao) {
    toast('Inspeção não encontrada.');
    location.hash = '#/inspecoes';
    return [];
  }
  const setores = await listarSetores(inspecao.clienteId);
  const registradas = new Set((await equipamentosDaInspecao(inspecaoId)).map((e) => e.id));

  const campoNome = el('input', {
    type: 'text',
    placeholder: 'Nome do novo setor',
    autocomplete: 'off',
  });

  async function criarEAbrir() {
    const nome = campoNome.value.trim();
    if (!nome) {
      toast('Informe o nome do setor.');
      campoNome.focus();
      return;
    }
    const setorId = await criarSetor(inspecao.clienteId, nome);
    toast('Setor criado.');
    location.hash = `#/inspecao/${inspecaoId}/setor/${setorId}`;
  }

  const cartoes = [];
  for (const setor of setores) {
    const equipamentos = await listarEquipamentosDoSetor(setor.id);
    const nestaInspecao = equipamentos.filter((e) => registradas.has(e.id)).length;
    cartoes.push(
      el(
        'a',
        { class: 'cartao', href: `#/inspecao/${inspecaoId}/setor/${setor.id}` },
        el(
          'div',
          { class: 'principal' },
          el('div', { class: 'titulo' }, setor.nome),
          el(
            'div',
            { class: 'detalhe' },
            `${equipamentos.length} máquina(s)/equipamento(s)` +
              (nestaInspecao > 0 ? ` · ${nestaInspecao} nesta inspeção` : '')
          )
        ),
        el('span', { class: 'seta' }, '›')
      )
    );
  }

  return [
    cabecalho('Escolher setor', {
      voltar: `#/inspecao/${inspecaoId}`,
      subtitulo: 'As máquinas/equipamentos ficam agrupadas por setor',
    }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Setores do cliente'),
      setores.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhum setor ainda. Crie o primeiro abaixo.')
        : el('div', { class: 'lista' }, cartoes),
      el(
        'div',
        { class: 'linha-form' },
        campoNome,
        el('button', { class: 'btn btn-secundario', onclick: criarEAbrir }, '+ Criar')
      ),
      el('h2', {}, 'Terminou os setores?'),
      el(
        'a',
        { class: 'btn btn-primario', href: `#/inspecao/${inspecaoId}` },
        'Revisar e exportar inspeção'
      )
    ),
  ];
}

/* ---------- Etapa 2: registrar as máquinas/equipamentos do setor ---------- */

export async function telaEquipamentosDoSetor(inspecaoId, setorId) {
  const inspecao = await obterInspecao(inspecaoId);
  const setor = await obterSetor(setorId);
  if (!inspecao || !setor) {
    toast('Setor não encontrado.');
    location.hash = `#/inspecao/${inspecaoId}/equipamentos`;
    return [];
  }
  const equipamentos = await listarEquipamentosDoSetor(setorId);
  const jaIncluidos = new Set((await equipamentosDaInspecao(inspecaoId)).map((e) => e.id));

  async function incluir(equipamentoId) {
    const incluiu = await incluirEquipamentoNaInspecao(inspecaoId, equipamentoId);
    if (incluiu) toast('Máquina/equipamento incluída.');
    location.hash = `#/inspecao/${inspecaoId}/equipamento/${equipamentoId}`;
  }

  const campoNome = el('input', {
    type: 'text',
    placeholder: 'Nome/TAG (a numeração é automática)',
    autocomplete: 'off',
  });

  async function criarEIncluir() {
    const nome = campoNome.value.trim();
    if (!nome) {
      toast('Informe o nome da máquina/equipamento.');
      campoNome.focus();
      return;
    }
    const equipamentoId = await criarEquipamento(inspecao.clienteId, setorId, nome);
    toast('Máquina/equipamento criada.');
    await incluir(equipamentoId);
  }

  // Cada máquina mostra o andamento do registro nesta inspeção:
  // OK (fotos obrigatórias completas), Pendente (incluída, faltam fotos) ou nada.
  const cartoes = [];
  for (const equipamento of equipamentos) {
    let selo = null;
    if (jaIncluidos.has(equipamento.id)) {
      const resumo = await resumoDoEquipamento(inspecaoId, equipamento.id);
      selo = resumo.completo
        ? el('span', { class: 'selo selo-verde' }, 'OK')
        : el('span', { class: 'selo selo-vermelho' }, 'Pendente');
    }
    cartoes.push(
      el(
        'button',
        { class: 'cartao', onclick: () => incluir(equipamento.id) },
        el('div', { class: 'principal' }, el('div', { class: 'titulo' }, equipamento.nome)),
        selo,
        el('span', { class: 'seta' }, '›')
      )
    );
  }

  return [
    cabecalho(setor.nome, {
      voltar: `#/inspecao/${inspecaoId}/equipamentos`,
      subtitulo: 'Registre as máquinas/equipamentos deste setor, uma após a outra',
    }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Máquinas/Equipamentos do setor'),
      equipamentos.length === 0
        ? el(
            'div',
            { class: 'vazio' },
            'Nenhuma máquina/equipamento cadastrada neste setor. Crie a primeira abaixo.'
          )
        : el('div', { class: 'lista' }, cartoes),
      el('h2', {}, 'Nova máquina/equipamento'),
      el(
        'div',
        { class: 'linha-form' },
        campoNome,
        el('button', { class: 'btn btn-secundario', onclick: criarEIncluir }, '+ Criar')
      ),
      el('h2', {}, 'Terminou este setor?'),
      el(
        'a',
        { class: 'btn btn-primario', href: `#/inspecao/${inspecaoId}/equipamentos` },
        'Concluir setor'
      )
    ),
  ];
}
