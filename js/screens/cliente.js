// Detalhe do cliente: equipamentos cadastrados e exclusão.

import { el, cabecalho, toast } from '../ui.js';
import {
  obterCliente,
  excluirCliente,
  listarEquipamentos,
  criarEquipamento,
  excluirEquipamento,
} from '../db.js';

export async function telaCliente(clienteId) {
  const cliente = await obterCliente(clienteId);
  if (!cliente) {
    toast('Cliente não encontrado.');
    location.hash = '#/clientes';
    return [];
  }
  const equipamentos = await listarEquipamentos(clienteId);

  async function removerEquipamento(equipamento) {
    if (
      !confirm(
        `Excluir o equipamento "${equipamento.nome}"? As medições e fotos dele em inspeções também serão apagadas.`
      )
    )
      return;
    await excluirEquipamento(equipamento.id);
    toast('Equipamento excluído.');
    location.reload();
  }

  const campoNome = el('input', {
    type: 'text',
    placeholder: 'Nome/TAG do equipamento',
    autocomplete: 'off',
  });
  const campoSetor = el('input', {
    type: 'text',
    placeholder: 'Setor (opcional)',
    autocomplete: 'off',
  });

  async function criar() {
    const nome = campoNome.value.trim();
    if (!nome) {
      toast('Informe o nome do equipamento.');
      campoNome.focus();
      return;
    }
    await criarEquipamento(clienteId, nome, campoSetor.value);
    toast('Equipamento criado.');
    location.reload();
  }

  async function removerCliente() {
    if (
      !confirm(
        `Excluir o cliente "${cliente.nome}"? Todos os equipamentos, inspeções, medições e fotos dele serão apagados. Esta ação não pode ser desfeita.`
      )
    )
      return;
    await excluirCliente(clienteId);
    toast('Cliente excluído.');
    location.hash = '#/clientes';
  }

  return [
    cabecalho(cliente.nome, { voltar: '#/clientes', subtitulo: 'Equipamentos do cliente' }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Equipamentos'),
      equipamentos.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhum equipamento ainda.')
        : el(
            'div',
            { class: 'lista' },
            equipamentos.map((equipamento) =>
              el(
                'div',
                { class: 'cartao', style: 'cursor: default' },
                el(
                  'div',
                  { class: 'principal' },
                  el('div', { class: 'titulo' }, equipamento.nome),
                  equipamento.setor ? el('div', { class: 'detalhe' }, equipamento.setor) : null
                ),
                el(
                  'button',
                  {
                    class: 'btn btn-discreto',
                    style: 'width:auto',
                    onclick: () => removerEquipamento(equipamento),
                  },
                  'Excluir'
                )
              )
            )
          ),
      el('h2', {}, 'Novo equipamento'),
      campoNome,
      el(
        'div',
        { class: 'linha-form' },
        campoSetor,
        el('button', { class: 'btn btn-secundario', onclick: criar }, '+ Criar')
      ),
      el('h2', {}, 'Ações'),
      el('button', { class: 'btn btn-perigo', onclick: removerCliente }, 'Excluir cliente')
    ),
  ];
}
