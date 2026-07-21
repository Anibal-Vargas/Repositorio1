// Cadastro de clientes.

import { el, cabecalho, toast } from '../ui.js';
import { listarClientes, criarCliente, listarEquipamentos } from '../db.js';

export async function telaClientes() {
  const clientes = await listarClientes();

  const cartoes = [];
  for (const cliente of clientes) {
    const equipamentos = await listarEquipamentos(cliente.id);
    cartoes.push(
      el(
        'a',
        { class: 'cartao', href: `#/cliente/${cliente.id}` },
        el(
          'div',
          { class: 'principal' },
          el('div', { class: 'titulo' }, cliente.nome),
          el('div', { class: 'detalhe' }, `${equipamentos.length} equipamento(s)`)
        ),
        el('span', { class: 'seta' }, '›')
      )
    );
  }

  const campoNome = el('input', {
    type: 'text',
    placeholder: 'Nome do novo cliente',
    autocomplete: 'off',
  });

  async function criar() {
    const nome = campoNome.value.trim();
    if (!nome) {
      toast('Informe o nome do cliente.');
      campoNome.focus();
      return;
    }
    const clienteId = await criarCliente(nome);
    toast('Cliente criado.');
    location.hash = `#/cliente/${clienteId}`;
  }

  return [
    cabecalho('Clientes e equipamentos', { voltar: '#/home' }),
    el(
      'main',
      { class: 'conteudo' },
      clientes.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhum cliente ainda.')
        : el('div', { class: 'lista' }, cartoes),
      el(
        'div',
        { class: 'linha-form' },
        campoNome,
        el('button', { class: 'btn btn-secundario', onclick: criar }, '+ Criar')
      )
    ),
  ];
}
