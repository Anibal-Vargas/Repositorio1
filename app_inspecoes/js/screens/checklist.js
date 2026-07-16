// Checklist — Fase 4: tela de inspeção dos tipos com itens de verificação.
// Subestações/Documental: um checklist por inspeção. Painéis: um checklist
// POR PAINEL (painelId 0 = checklist da inspeção inteira).
// Cada item: Conforme / Não conforme / N.A. "Não conforme" cria uma NC
// vinculada com o fluxo de fotos/áudio/descrição. O inspetor pode incluir
// itens além do checklist na seção "Itens adicionais".

import {
  db, obterRespostas, definirResposta, responderNaoConforme, excluirNC,
  listarItensExtras, criarItemExtra, excluirItemExtra, obterPainel,
} from '../db.js';
import { checklistDoTipo } from '../checklists.js';
import { el, cabecalho, toast, formatarDataHora } from '../ui.js';

/** Rota #/inspecao/:id/painel/:painelId — checklist de um painel. */
export async function telaPainel(inspecaoId, painelId) {
  const [inspecao, painel] = await Promise.all([
    db.inspecoes.get(inspecaoId),
    obterPainel(painelId),
  ]);
  if (!inspecao || !painel) { location.hash = '#/home'; return el('div'); }
  return telaChecklist(inspecao, painel);
}

export async function telaChecklist(inspecao, painel = null) {
  const inspecaoId = inspecao.id;
  const painelId = painel ? painel.id : 0;
  const checklist = checklistDoTipo(inspecao.tipo);
  const [cliente, todasRespostas, todosExtras, areaDoPainel] = await Promise.all([
    db.clientes.get(inspecao.clienteId),
    obterRespostas(inspecaoId),
    listarItensExtras(inspecaoId),
    painel ? db.areas.get(painel.areaId) : null,
  ]);
  const respostas = todasRespostas.filter((r) => (r.painelId ?? 0) === painelId);
  const extras = todosExtras.filter((e) => (e.painelId ?? 0) === painelId);
  const respostaPorItem = new Map(respostas.map((r) => [r.itemId, r]));
  const ncsPorId = new Map(
    (await db.ncs.where('inspecaoId').equals(inspecaoId).toArray()).map((nc) => [nc.id, nc]),
  );

  const titulo = painel ? painel.nome : (cliente ? cliente.nome : 'Inspeção');
  const voltarPara = painel ? `#/inspecao/${inspecaoId}/area/${painel.areaId}` : '#/home';
  const subtitulo = painel
    ? `${areaDoPainel ? areaDoPainel.nome + ' · ' : ''}${cliente ? cliente.nome : ''}`
    : `${checklist ? checklist.rotulo : ''} · ${formatarDataHora(inspecao.criadoEm)}`;

  const conteudo = el('main', { class: 'conteudo' });

  if (!checklist || !checklist.secoes.some((s) => s.itens.length)) {
    conteudo.append(el('p', { class: 'vazio' },
      'O checklist deste tipo ainda não foi configurado.'));
    return [cabecalho(titulo, voltarPara, subtitulo), conteudo];
  }

  // ---- progresso (itens do checklist + itens adicionais) ----
  const totalDeItens =
    checklist.secoes.reduce((s, sec) => s + sec.itens.length, 0) + extras.length;
  const verificados = [...respostaPorItem.values()].filter((r) => r.status).length;
  const naoConformes = [...respostaPorItem.values()].filter((r) => r.status === 'nao_conforme').length;
  conteudo.append(el('p', { class: 'progresso-checklist' },
    `${verificados} de ${totalDeItens} itens verificados` +
    (naoConformes ? ` · ${naoConformes} NC` : '')));

  function recarregar() {
    telaChecklist(inspecao, painel).then((novo) => {
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
    await definirResposta(inspecaoId, painelId, item.id, atual === novoStatus ? null : novoStatus);
    recarregar();
  }

  async function marcarNaoConforme(item, resposta) {
    if (resposta && resposta.status === 'nao_conforme' && resposta.ncId) {
      location.hash = `#/nc/${resposta.ncId}`; // já tem NC: abre para editar
      return;
    }
    const ncId = await responderNaoConforme(inspecaoId, painelId, item.id, item.texto);
    toast('NC criada para o item. Adicione fotos.');
    location.hash = `#/nc/${ncId}`;
  }

  // ---- linha de um item (do checklist ou adicional) ----
  function renderizarItem(item, ehExtra) {
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
      }, 'N.A.'),
    );

    const texto = el('p', { class: 'texto-item' }, item.texto);
    const topo = ehExtra
      ? el('div', { class: 'linha-item-extra' },
          texto,
          el('button', {
            class: 'btn-excluir-extra', 'aria-label': 'Excluir item adicional',
            onclick: async () => {
              const aviso = nc
                ? ` A ${nc.numero} vinculada (com fotos e áudios) também será excluída.`
                : '';
              if (!confirm(`Excluir o item "${item.texto}"?${aviso}`)) return;
              await excluirItemExtra(inspecaoId, item.id);
              toast('Item excluído.');
              recarregar();
            },
          }, '🗑️'),
        )
      : texto;

    return el('div', { class: 'item-checklist' }, topo, linhaBotoes);
  }

  // ---- seções do checklist ----
  for (const secao of checklist.secoes) {
    if (!secao.itens.length) continue;
    conteudo.append(el('h2', { class: 'secao-checklist' }, secao.titulo));
    for (const item of secao.itens) conteudo.append(renderizarItem(item, false));
  }

  // ---- itens adicionais (criados em campo pelo inspetor) ----
  conteudo.append(el('h2', { class: 'secao-checklist' }, 'Itens adicionais'));
  for (const extra of extras) {
    conteudo.append(renderizarItem({ id: extra.itemId, texto: extra.texto }, true));
  }
  const campoNovoItem = el('input', {
    type: 'text', id: 'novo-item',
    placeholder: 'Descreva o item a verificar…',
  });
  const adicionarItem = async () => {
    const texto = campoNovoItem.value.trim();
    if (!texto) { campoNovoItem.focus(); return; }
    await criarItemExtra(inspecaoId, painelId, texto);
    toast('Item adicionado ao checklist.');
    recarregar();
  };
  campoNovoItem.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') adicionarItem();
  });
  conteudo.append(el('div', { class: 'linha-form' },
    campoNovoItem,
    el('button', { class: 'btn btn-primario', onclick: adicionarItem }, '+ Adicionar'),
  ));

  conteudo.append(el('p', { class: 'info-armazenamento' },
    'Toque de novo em um status para desmarcar. "Não conforme" abre a NC para fotos, áudio e descrição.'));

  return [cabecalho(titulo, voltarPara, subtitulo), conteudo];
}
