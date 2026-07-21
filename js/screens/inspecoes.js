// Lista de inspeções (em andamento e finalizadas).

import { el, cabecalho, formatarDataHora } from '../ui.js';
import { listarInspecoes, obterCliente } from '../db.js';

export async function telaInspecoes() {
  const inspecoes = await listarInspecoes();
  const cartoes = [];
  for (const inspecao of inspecoes) {
    const cliente = await obterCliente(inspecao.clienteId);
    const finalizada = inspecao.status === 'finalizada';
    cartoes.push(
      el(
        'a',
        { class: 'cartao', href: `#/inspecao/${inspecao.id}` },
        el(
          'div',
          { class: 'principal' },
          el('div', { class: 'titulo' }, cliente ? cliente.nome : 'Cliente removido'),
          el('div', { class: 'detalhe' }, formatarDataHora(inspecao.criadaEm))
        ),
        el(
          'span',
          { class: finalizada ? 'selo selo-verde' : 'selo' },
          finalizada ? 'Finalizada' : 'Em andamento'
        ),
        el('span', { class: 'seta' }, '›')
      )
    );
  }

  return [
    cabecalho('Inspeções', { voltar: '#/home' }),
    el(
      'main',
      { class: 'conteudo' },
      inspecoes.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhuma inspeção ainda.')
        : el('div', { class: 'lista' }, cartoes)
    ),
  ];
}
