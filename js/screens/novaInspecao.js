// Nova inspeção: escolher (ou criar) o cliente e iniciar.

import { el, cabecalho, toast } from '../ui.js';
import { listarClientes, criarCliente, criarInspecao } from '../db.js';

export async function telaNovaInspecao() {
  const clientes = await listarClientes();

  const campoResponsavel = el('input', {
    type: 'text',
    placeholder: 'Nome do responsável pela medição',
    autocomplete: 'off',
  });
  const campoInstrumento = el('input', {
    type: 'text',
    placeholder: 'Ex.: microohmímetro, nº de série',
    autocomplete: 'off',
  });

  async function iniciar(clienteId) {
    try {
      const inspecaoId = await criarInspecao(
        clienteId,
        campoResponsavel.value,
        campoInstrumento.value
      );
      toast('Inspeção criada.');
      location.hash = `#/inspecao/${inspecaoId}`;
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
    const clienteId = await criarCliente(nome);
    toast('Cliente criado.');
    await iniciar(clienteId);
  }

  return [
    cabecalho('Nova inspeção', { voltar: '#/home' }),
    el(
      'main',
      { class: 'conteudo' },
      el('label', {}, 'Responsável', campoResponsavel),
      el('label', {}, 'Instrumento de medição', campoInstrumento),
      el('h2', {}, 'Cliente'),
      clientes.length === 0
        ? el('div', { class: 'vazio' }, 'Nenhum cliente ainda. Crie o primeiro abaixo.')
        : el(
            'div',
            { class: 'lista' },
            clientes.map((cliente) =>
              el(
                'button',
                { class: 'cartao', onclick: () => iniciar(cliente.id) },
                el('div', { class: 'principal' }, el('div', { class: 'titulo' }, cliente.nome)),
                el('span', { class: 'seta' }, '›')
              )
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
