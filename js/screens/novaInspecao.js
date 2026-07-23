// Nova inspeção: escolher o inspetor e o cliente (ou criar novos) e iniciar.

import { el, cabecalho, toast } from '../ui.js';
import {
  listarInspetores,
  criarInspetor,
  listarClientes,
  criarCliente,
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

  // Cliente em lista suspensa (mesmo padrão do inspetor). O valor da opção é o id.
  const seletorCliente = el(
    'select',
    {},
    el('option', { value: '' }, 'Escolha o cliente…'),
    clientes.map((cliente) => el('option', { value: String(cliente.id) }, cliente.nome))
  );

  const campoNovoCliente = el('input', {
    type: 'text',
    placeholder: 'Nome do novo cliente',
    autocomplete: 'off',
  });

  async function adicionarCliente() {
    const nome = campoNovoCliente.value.trim();
    if (!nome) {
      toast('Informe o nome do cliente.');
      campoNovoCliente.focus();
      return;
    }
    const clienteId = await criarCliente(nome);
    seletorCliente.append(el('option', { value: String(clienteId) }, nome));
    seletorCliente.value = String(clienteId);
    campoNovoCliente.value = '';
    toast('Cliente incluído.');
  }

  async function iniciar() {
    const inspetor = seletorInspetor.value;
    if (!inspetor) {
      toast('Escolha o inspetor.');
      seletorInspetor.focus();
      return;
    }
    const clienteId = seletorCliente.value;
    if (!clienteId) {
      toast('Escolha o cliente.');
      seletorCliente.focus();
      return;
    }
    try {
      const inspecaoId = await criarInspecao(Number(clienteId), inspetor);
      toast('Inspeção criada.');
      // Vai direto para a escolha do setor — o fluxo de campo começa aqui.
      location.hash = `#/inspecao/${inspecaoId}/equipamentos`;
    } catch {
      toast('Erro ao criar a inspeção.');
    }
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
      seletorCliente,
      el(
        'div',
        { class: 'linha-form' },
        campoNovoCliente,
        el('button', { class: 'btn btn-secundario', onclick: adicionarCliente }, '+ Incluir')
      ),
      el('button', { class: 'btn btn-primario btn-grande', onclick: iniciar }, 'Iniciar inspeção')
    ),
  ];
}
