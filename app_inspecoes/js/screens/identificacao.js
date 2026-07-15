// Tela de identificação do inspetor — aparece apenas no primeiro uso.
// Lista os inspetores da Nord Consult; também aceita digitar outro nome.

import { salvarInspetor } from '../db.js';
import { solicitarPersistencia } from '../storage.js';
import { el, toast } from '../ui.js';

const INSPETORES = [
  'Adauto Muller',
  'Anibal Vargas',
  'Hugo Araújo',
  'Leonardo Oliveira',
  'Thiago Lazzarin',
];

async function concluir(nome, empresa) {
  await salvarInspetor({ nome, empresa, criadoEm: Date.now() });

  // Primeiro uso: pede armazenamento persistente para as fotos não
  // serem apagadas pelo Android sob pressão de disco.
  const persistente = await solicitarPersistencia();
  toast(persistente
    ? `Bem-vindo(a), ${nome}!`
    : 'Atenção: o navegador não garantiu armazenamento persistente.');
  location.hash = '#/home';
}

export async function telaIdentificacao() {
  // ---- Lista de inspetores predefinidos ----
  const lista = el('div', { class: 'lista' },
    INSPETORES.map((nome) => el('button', {
      class: 'cartao',
      onclick: () => concluir(nome, 'Nord Consult'),
    },
      el('span', { class: 'principal' }, el('span', { class: 'titulo' }, nome)),
      el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
    )),
  );

  // ---- Entrada manual (aparece ao tocar em "Digitar outro nome") ----
  const campoNome = el('input', {
    type: 'text', id: 'nome', autocomplete: 'name',
    placeholder: 'Ex.: João da Silva', required: true,
  });
  const campoEmpresa = el('input', {
    type: 'text', id: 'empresa', autocomplete: 'organization',
    placeholder: 'Opcional',
  });

  const formulario = el('form', {
    style: 'display:none',
    onsubmit: async (evento) => {
      evento.preventDefault();
      const nome = campoNome.value.trim();
      if (!nome) { campoNome.focus(); return; }
      await concluir(nome, campoEmpresa.value.trim());
    },
  },
    el('div', {}, el('label', { for: 'nome' }, 'Seu nome *'), campoNome),
    el('div', {}, el('label', { for: 'empresa' }, 'Empresa'), campoEmpresa),
    el('button', { class: 'btn btn-destaque', type: 'submit' }, 'Começar'),
  );

  const botaoOutro = el('button', {
    class: 'btn btn-secundario',
    onclick: () => {
      formulario.style.display = '';
      botaoOutro.style.display = 'none';
      campoNome.focus();
    },
  }, '✏️ Digitar outro nome');

  return el('main', { class: 'conteudo tela-identificacao' },
    el('img', { class: 'logo-marca', src: 'icons/logo-nord.png', alt: 'Nord Consult' }),
    el('h1', {}, 'Inspeções de conformidade Técnica/NR-10 – Nord Consult'),
    el('p', {}, 'Quem está inspecionando? Isso é pedido apenas uma vez.'),
    lista,
    botaoOutro,
    formulario,
  );
}
