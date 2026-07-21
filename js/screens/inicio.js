// Tela de abertura: logo em destaque, nome do app e botão "Iniciar".

import { el } from '../ui.js';
import { VERSAO_APP } from '../versao.js';

export async function telaInicio() {
  return [
    el(
      'main',
      { class: 'tela-inicio' },
      el('img', { class: 'logo', src: 'icons/logo-nord.png', alt: 'Nord Consult' }),
      el('h1', {}, 'Medição de continuidade de aterramento elétrico de máquinas e equipamentos'),
      el('div', { class: 'marca' }, 'NORD CONSULT LTDA'),
      el('div', { class: 'versao' }, `Versão ${VERSAO_APP}`),
      el(
        'a',
        { class: 'btn btn-primario btn-grande', href: '#/home' },
        'Iniciar'
      )
    ),
  ];
}
