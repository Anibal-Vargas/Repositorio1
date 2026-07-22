// Nova inspeção: escolher o inspetor e o cliente (ou criar novos) e iniciar.

import { el, cabecalho, toast, cartaoEditavel } from '../ui.js';
import {
  listarInspetores,
  criarInspetor,
  listarClientes,
  criarCliente,
  renomearCliente,
  criarInspecao,
} from '../db.js';

export async function telaNovaInspecao() {
  const inspetores = await listarInspetores();
  const clientes = await listarClientes();

  const seletorInspetor = el(
    'select',
    {},
    el('option', { value: '' }, 'Escolha o inspetor…'),
    inspetores.map((inspetor) => el('option', { value: inspetor.nome }, inspetor.nome))
  );

  const campoNovoInspetor = el('input', {
    type: 'text',
    placeholder: 'Nome do novo inspetor',
    autocomplete: 'off',
  });

  async function adicionarInspetor() {
    const nome = campoNovoInspetor.value.trim();
    if (!nome) {
      toast('Informe o nome do inspetor.');
      campoNovoInspetor.focus();
      return;
    }
    await criarInspetor(nome);
    if (![...seletorInspetor.options].some((opcao) => opcao.value === nome)) {
      seletorInspetor.append(el('option', { value: nome }, nome));
    }
    seletorInspetor.value = nome;
    campoNovoInspetor.value = '';
    toast('Inspetor incluído.');
  }

  async function iniciar(clienteId) {
    const inspetor = seletorInspetor.value;
    if (!inspetor) {
      toast('Escolha o inspetor.');
      seletorInspetor.focus();
      return;
    }
    try {
      const inspecaoId = await criarInspecao(clienteId, inspetor);
      toast('Inspeção criada.');
      // Vai direto para a escolha do setor — o fluxo de campo começa aqui.
      location.hash = `#/inspecao/${inspecaoId}/equipamentos`;
    } catch {
      toast('Erro ao criar a inspeção.');
    }
  }

  const campoNovoCliente = el('input', {
    type: 'text',
    placeholder: 'Nome do novo cliente',
    autocomplete: 'off',
  });

  async function criarEIniciar() {
    const nome = campoNovoCliente.value.trim();
    if (!nome) {
      toast('Informe o nome do cliente.');
      campoNovoCliente.focus();
      return;
    }
    if (!seletorInspetor.value) {
      toast('Escolha o inspetor.');
      seletorInspetor.focus();
      return;
    }
    const clienteId = await criarCliente(nome);
    toast('Cliente criado.');
    await iniciar(clienteId);
  }

  return [
    cabecalho('Nova inspeção', { voltar: '#/home' }),
    el(
      'main',
      { class: 'conteudo' },
      el('h2', {}, 'Inspetor'),
      seletorInspetor,
      el(
        'div',
        { class: 'linha-form' },
        campoNovoInspetor,
        el('button', { class: 'btn btn-secundario', onclick: adicionarInspetor }, '+ Incluir')
      ),
      el('h2', {}, 'Cliente'),
      clientes.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhum cliente ainda. Crie o primeiro abaixo.')
        : el(
            'div',
            { class: 'lista' },
            clientes.map((cliente) =>
              cartaoEditavel({
                onSelecionar: () => iniciar(cliente.id),
                titulo: cliente.nome,
                valorEditavel: cliente.nome,
                aoRenomear: (novo) => renomearCliente(cliente.id, novo).then(() => novo),
                // Cliente pode ser renomeado, mas não excluído nesta tela.
              })
            )
          ),
      el(
        'div',
        { class: 'linha-form' },
        campoNovoCliente,
        el('button', { class: 'btn btn-secundario', onclick: criarEIniciar }, '+ Criar')
      )
    ),
  ];
}
