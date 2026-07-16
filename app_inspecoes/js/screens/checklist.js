// Checklist — Fase 4: tela de inspeção dos tipos com itens de verificação
// (Subestações, Painéis, Documental). Cada item: Conforme / Não conforme /
// Não se aplica. "Não conforme" cria uma NC vinculada e abre a câmera de
// fotos/áudio/descrição no fluxo já conhecido.

import {
  db, obterRespostas, definirResposta, responderNaoConforme, excluirNC,
} from '../db.js';
import { checklistDoTipo } from '../checklists.js';
import { el, cabecalho, toast, formatarDataHora } from '../ui.js';

export async function telaChecklist(inspecao) {
  const inspecaoId = inspecao.id;
  const checklist = checklistDoTipo(inspecao.tipo);
  const [cliente, respostas] = await Promise.all([
    db.clientes.get(inspecao.clienteId),
    obterRespostas(inspecaoId),
  ]);
  const respostaPorItem = new Map(respostas.map((r) => [r.itemId, r]));
  const ncsPorId = new Map(
    (await db.ncs.where('inspecaoId').equals(inspecaoId).toArray()).map((nc) => [nc.id, nc]),
  );

  const conteudo = el('main', { class: 'conteudo' });

  if (!checklist || !checklist.secoes.some((s) => s.itens.length)) {
    conteudo.append(el('p', { class: 'vazio' },
      'O checklist deste tipo ainda não foi configurado.'));
    return [cabecalho(cliente ? cliente.nome : 'Inspeção', '#/home'), conteudo];
  }

  // ---- progresso ----
  const totalDeItens = checklist.secoes.reduce((s, sec) => s + sec.itens.length, 0);
  const verificados = [...respostaPorItem.values()].filter((r) => r.status).length;
  const naoConformes = [...respostaPorItem.values()].filter((r) => r.status === 'nao_conforme').length;
  conteudo.append(el('p', { class: 'progresso-checklist' },
    `${verificados} de ${totalDeItens} itens verificados` +
    (naoConformes ? ` · ${naoConformes} NC` : '')));

  function recarregar() {
    telaChecklist(inspecao).then((novo) => {
      document.getElementById('app').replaceChildren(...(Array.isArray(novo) ? novo : [novo]));
    });
  }

  // Troca de status quando já existe NC vinculada exige excluir a NC.
  async function trocarStatus(item, resposta, novoStatus) {
    if (resposta && resposta.ncId) {
      const nc = ncsPorId.get(resposta.ncId);
      const numero = nc ? nc.numero : 'a NC vinculada';
      if (!confirm(`Este item tem a ${numero} vinculada. Alterar o status vai EXCLUIR a NC com suas fotos e áudios. Continuar?`)) return;
      await excluirNC(resposta.ncId);
    }
    // tocar no status já selecionado limpa a marcação
    const atual = resposta && !resposta.ncId ? resposta.status : null;
    await definirResposta(inspecaoId, item.id, atual === novoStatus ? null : novoStatus);
    recarregar();
  }

  async function marcarNaoConforme(item, resposta) {
    if (resposta && resposta.status === 'nao_conforme' && resposta.ncId) {
      location.hash = `#/nc/${resposta.ncId}`; // já tem NC: abre para editar
      return;
    }
    const ncId = await responderNaoConforme(inspecaoId, item.id, item.texto);
    toast('NC criada para o item. Adicione fotos.');
    location.hash = `#/nc/${ncId}`;
  }

  // ---- seções e itens ----
  for (const secao of checklist.secoes) {
    if (!secao.itens.length) continue;
    conteudo.append(el('h2', {}, secao.titulo));
    for (const item of secao.itens) {
      const resposta = respostaPorItem.get(item.id) || null;
      const status = resposta ? resposta.status : null;
      const nc = resposta && resposta.ncId ? ncsPorId.get(resposta.ncId) : null;

      const linhaBotoes = el('div', { class: 'opcoes-item' },
        el('button', {
          class: `btn-opcao ${status === 'conforme' ? 'sel-conforme' : ''}`,
          onclick: () => trocarStatus(item, resposta, 'conforme'),
        }, '✔ Conforme'),
        el('button', {
          class: `btn-opcao ${status === 'nao_conforme' ? 'sel-nc' : ''}`,
          onclick: () => marcarNaoConforme(item, resposta),
        }, status === 'nao_conforme' && nc ? `✖ ${nc.numero} ›` : '✖ Não conforme'),
        el('button', {
          class: `btn-opcao ${status === 'nao_aplica' ? 'sel-na' : ''}`,
          onclick: () => trocarStatus(item, resposta, 'nao_aplica'),
        }, 'Ø N.A.'),
      );

      conteudo.append(el('div', { class: `item-checklist ${status ? 'respondido' : ''}` },
        el('p', { class: 'texto-item' }, item.texto),
        linhaBotoes,
      ));
    }
  }

  conteudo.append(el('p', { class: 'info-armazenamento' },
    'Toque de novo em um status para desmarcar. "Não conforme" abre a NC para fotos, áudio e descrição.'));

  return [
    cabecalho(
      cliente ? cliente.nome : 'Inspeção',
      '#/home',
      `${checklist.rotulo} · ${formatarDataHora(inspecao.criadoEm)}`,
    ),
    conteudo,
  ];
}
