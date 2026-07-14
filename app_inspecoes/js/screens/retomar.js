// Retomar inspeção — lista as inspeções abertas com progresso.

import { db, listarInspecoesAbertas, progressoInspecao } from '../db.js';
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
    return el('button', {
      class: 'cartao',
      onclick: () => { location.hash = `#/inspecao/${inspecao.id}`; },
    },
      el('span', { class: 'principal' },
        el('span', { class: 'titulo' }, cliente ? cliente.nome : 'Cliente removido'),
        el('span', { class: 'detalhe' },
          `${ROTULO_TIPO[inspecao.tipo] || inspecao.tipo} · iniciada em ${formatarDataHora(inspecao.criadoEm)}`),
        el('span', { class: 'detalhe' },
          `📍 ${progresso.areas} área${progresso.areas === 1 ? '' : 's'} · ` +
          `⚠️ ${progresso.ncs} NC${progresso.ncs === 1 ? '' : 's'} · ` +
          `📷 ${progresso.fotos} foto${progresso.fotos === 1 ? '' : 's'}`),
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
