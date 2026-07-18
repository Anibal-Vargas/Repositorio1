// Retomar inspeção — lista as inspeções abertas com progresso.

import { db, listarInspecoesAbertas, progressoInspecao, obterRespostas, contarItensExtras, contarPaineis } from '../db.js';
import { tipoTemChecklist, totalItens } from '../checklists.js';
import { el, cabecalho, formatarDataHora } from '../ui.js';

const ROTULO_TIPO = {
  geral: 'Geral',
  subestacoes: 'Subestações',
  paineis: 'Painéis',
  documental: 'Documental',
};

export async function telaRetomar() {
  const abertas = await listarInspecoesAbertas();

  const cartoes = await Promise.all(abertas.map(async (inspecao) => {
    const [cliente, progresso] = await Promise.all([
      db.clientes.get(inspecao.clienteId),
      progressoInspecao(inspecao.id),
    ]);
    let linhaProgresso =
      `📍 ${progresso.areas} área${progresso.areas === 1 ? '' : 's'} · ` +
      `⚠️ ${progresso.ncs} NC${progresso.ncs === 1 ? '' : 's'} · ` +
      `📷 ${progresso.fotos} foto${progresso.fotos === 1 ? '' : 's'}`;
    if (inspecao.tipo === 'paineis' && inspecao.modo !== 'fotos') {
      const nPaineis = await contarPaineis(inspecao.id);
      linhaProgresso =
        `🎛️ ${nPaineis} ${nPaineis === 1 ? 'painel' : 'painéis'} · ` +
        `⚠️ ${progresso.ncs} NC${progresso.ncs === 1 ? '' : 's'} · ` +
        `📷 ${progresso.fotos} foto${progresso.fotos === 1 ? '' : 's'}`;
    } else if (inspecao.tipo === 'subestacoes') {
      const respostas = await obterRespostas(inspecao.id);
      if (respostas.some((r) => (r.painelId ?? 0) === 0)) {
        const extras = await contarItensExtras(inspecao.id);
        const verificados = respostas.filter((r) => r.status).length;
        linhaProgresso =
          `✅ ${verificados} de ${totalItens('subestacoes') + extras} itens · ` +
          `⚠️ ${progresso.ncs} NC${progresso.ncs === 1 ? '' : 's'} · ` +
          `📷 ${progresso.fotos} foto${progresso.fotos === 1 ? '' : 's'}`;
      } else {
        const n = await contarPaineis(inspecao.id);
        linhaProgresso =
          `⚡ ${n} ${n === 1 ? 'subestação' : 'subestações'} · ` +
          `⚠️ ${progresso.ncs} NC${progresso.ncs === 1 ? '' : 's'} · ` +
          `📷 ${progresso.fotos} foto${progresso.fotos === 1 ? '' : 's'}`;
      }
    } else if (inspecao.tipo !== 'paineis' && tipoTemChecklist(inspecao.tipo)) {
      // Painéis "somente fotos" mantém a linha padrão de áreas/NCs/fotos.
      const [respostas, extras] = await Promise.all([
        obterRespostas(inspecao.id),
        contarItensExtras(inspecao.id),
      ]);
      const verificados = respostas.filter((r) => r.status).length;
      linhaProgresso =
        `✅ ${verificados} de ${totalItens(inspecao.tipo) + extras} itens · ` +
        `⚠️ ${progresso.ncs} NC${progresso.ncs === 1 ? '' : 's'} · ` +
        `📷 ${progresso.fotos} foto${progresso.fotos === 1 ? '' : 's'}`;
    }
    return el('button', {
      class: 'cartao',
      onclick: () => { location.hash = `#/inspecao/${inspecao.id}`; },
    },
      el('span', { class: 'principal' },
        el('span', { class: 'titulo' }, cliente ? cliente.nome : 'Cliente removido'),
        el('span', { class: 'detalhe' },
          `${ROTULO_TIPO[inspecao.tipo] || inspecao.tipo} · iniciada em ${formatarDataHora(inspecao.criadoEm)}`),
        el('span', { class: 'detalhe' }, linhaProgresso),
        el('span', { class: 'detalhe' },
          `Última atividade: ${formatarDataHora(inspecao.atualizadoEm)}`),
      ),
      el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
    );
  }));

  return [
    cabecalho('Retomar inspeção', '#/home'),
    el('main', { class: 'conteudo' },
      cartoes.length
        ? el('div', { class: 'lista' }, cartoes)
        : el('p', { class: 'vazio' }, 'Nenhuma inspeção aberta. Crie uma nova na tela inicial.'),
    ),
  ];
}
