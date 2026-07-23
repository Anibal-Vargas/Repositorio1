// Lista de inspeções (em andamento e finalizadas).
// O botão ⋮ de cada linha gerencia o CLIENTE daquela inspeção (alterar/apagar).

import { el, cabecalho, toast, formatarDataHora, cartaoComMenu } from '../ui.js';
import { listarInspecoes, obterCliente, renomearCliente, excluirCliente } from '../db.js';

export async function telaInspecoes() {
  const inspecoes = await listarInspecoes();
  const cartoes = [];
  for (const inspecao of inspecoes) {
    const cliente = await obterCliente(inspecao.clienteId);
    const finalizada = inspecao.status === 'finalizada';
    const selo = el(
      'span',
      { class: finalizada ? 'selo selo-verde' : 'selo' },
      finalizada ? 'Finalizada' : 'Em andamento'
    );

    if (!cliente) {
      // Cliente já removido: linha simples, sem menu.
      cartoes.push(
        el(
          'a',
          { class: 'cartao', href: `#/inspecao/${inspecao.id}` },
          el(
            'div',
            { class: 'principal' },
            el('div', { class: 'titulo' }, 'Cliente removido'),
            el('div', { class: 'detalhe' }, formatarDataHora(inspecao.criadaEm))
          ),
          selo,
          el('span', { class: 'seta' }, '›')
        )
      );
      continue;
    }

    cartoes.push(
      cartaoComMenu({
        href: `#/inspecao/${inspecao.id}`,
        titulo: cliente.nome,
        detalhe: formatarDataHora(inspecao.criadaEm),
        selo,
        valorEditavel: cliente.nome,
        rotuloAlterar: 'Alterar nome do cliente',
        rotuloApagar: 'Apagar cliente',
        // O cliente pode ter várias inspeções — recarrega para refletir em todas.
        aoRenomear: async (novo) => {
          await renomearCliente(cliente.id, novo);
          location.reload();
        },
        aoApagar: async () => {
          await excluirCliente(cliente.id);
          toast('Cliente apagado.');
          location.reload();
        },
        confirmacaoApagar: `Apagar o cliente "${cliente.nome}"? Todas as inspeções, setores, máquinas/equipamentos, fotos e áudios dele serão apagados.`,
      })
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
