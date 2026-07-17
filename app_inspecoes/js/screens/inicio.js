// Tela de abertura — logo, título e botão Iniciar. Aparece ao abrir o app.

import { el } from '../ui.js';
import { VERSAO_APP } from '../versao.js';

export async function telaInicio() {
  return el('main', { class: 'conteudo tela-inicio' },
    el('img', { class: 'logo-inicio', src: 'icons/logo-nord.png', alt: 'Nord Consult' }),
    el('h1', {}, 'Inspeções Técnicas e de NR-10'),
    el('p', { class: 'marca' }, 'Nord Consult'),
    el('p', { class: 'versao' }, `Versão ${VERSAO_APP}`),
    el('button', {
      class: 'btn btn-destaque btn-grande',
      onclick: () => { location.hash = '#/home'; },
    }, 'Iniciar'),
  );
}
