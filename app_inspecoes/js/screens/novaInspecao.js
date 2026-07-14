// Nova inspeção — passo 1: selecionar/cadastrar cliente; passo 2: tipo.

import { listarClientes, criarCliente, criarInspecao } from '../db.js';
import { el, cabecalho, toast } from '../ui.js';

const TIPOS = [
  { codigo: 'geral', rotulo: 'Geral', icone: '🏭', ativo: true },
  { codigo: 'subestacoes', rotulo: 'Subestações', icone: '⚡', ativo: false },
  { codigo: 'paineis', rotulo: 'Painéis', icone: '🎛️', ativo: false },
  { codigo: 'documental', rotulo: 'Documental', icone: '📄', ativo: false },
];

export async function telaNovaInspecao() {
  const raiz = el('main', { class: 'conteudo' });
  await passoCliente(raiz);
  return [cabecalho('Nova inspeção', '#/home'), raiz];
}

async function passoCliente(raiz) {
  const clientes = await listarClientes();

  const campoNovo = el('input', { type: 'text', placeholder: 'Nome do novo cliente' });
  const cadastrar = async () => {
    const nome = campoNovo.value.trim();
    if (!nome) { campoNovo.focus(); return; }
    const cliente = await criarCliente(nome);
    toast(`Cliente "${cliente.nome}" cadastrado.`);
    passoTipo(raiz, cliente);
  };

  raiz.replaceChildren(
    el('h2', {}, '1 de 2 — Cliente'),
    clientes.length
      ? el('div', { class: 'lista' },
          clientes.map((cliente) => el('button', {
            class: 'cartao',
            onclick: () => passoTipo(raiz, cliente),
          },
            el('span', { class: 'principal' }, el('span', { class: 'titulo' }, cliente.nome)),
            el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
          )),
        )
      : el('p', { class: 'vazio' }, 'Nenhum cliente cadastrado ainda.'),
    el('h2', {}, 'Ou cadastre um novo'),
    el('div', { class: 'linha-form' },
      campoNovo,
      el('button', { class: 'btn btn-primario', onclick: cadastrar }, 'Cadastrar'),
    ),
  );
  campoNovo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') cadastrar();
  });
}

function passoTipo(raiz, cliente) {
  raiz.replaceChildren(
    el('h2', {}, `2 de 2 — Tipo de inspeção · ${cliente.nome}`),
    el('div', { class: 'lista' },
      TIPOS.map((tipo) => el('button', {
        class: 'cartao',
        disabled: !tipo.ativo,
        onclick: async () => {
          const id = await criarInspecao(cliente.id, tipo.codigo);
          toast('Inspeção criada. Tudo é salvo automaticamente.');
          location.hash = `#/inspecao/${id}`;
        },
      },
        el('span', { 'aria-hidden': 'true', style: 'font-size:1.6rem' }, tipo.icone),
        el('span', { class: 'principal' },
          el('span', { class: 'titulo' }, tipo.rotulo),
          tipo.ativo ? null : el('span', { class: 'detalhe' }, 'Em breve (Fase 4)'),
        ),
        tipo.ativo ? el('span', { class: 'seta', 'aria-hidden': 'true' }, '›') : null,
      )),
    ),
    el('button', { class: 'btn btn-discreto', onclick: () => passoCliente(raiz) },
      '← Trocar cliente'),
  );
}
