// Tela de identificação do inspetor — aparece apenas no primeiro uso.

import { salvarInspetor } from '../db.js';
import { solicitarPersistencia } from '../storage.js';
import { el, toast } from '../ui.js';

export async function telaIdentificacao() {
  const campoNome = el('input', {
    type: 'text', id: 'nome', autocomplete: 'name',
    placeholder: 'Ex.: João da Silva', required: true,
  });
  const campoEmpresa = el('input', {
    type: 'text', id: 'empresa', autocomplete: 'organization',
    placeholder: 'Opcional',
  });

  const formulario = el('form', {
    onsubmit: async (evento) => {
      evento.preventDefault();
      const nome = campoNome.value.trim();
      if (!nome) { campoNome.focus(); return; }
      await salvarInspetor({ nome, empresa: campoEmpresa.value.trim(), criadoEm: Date.now() });

      // Primeiro uso: pede armazenamento persistente para as fotos não
      // serem apagadas pelo Android sob pressão de disco.
      const persistente = await solicitarPersistencia();
      toast(persistente
        ? 'Armazenamento protegido. Bom trabalho!'
        : 'Atenção: o navegador não garantiu armazenamento persistente.');
      location.hash = '#/home';
    },
  },
    el('div', {}, el('label', { for: 'nome' }, 'Seu nome *'), campoNome),
    el('div', {}, el('label', { for: 'empresa' }, 'Empresa'), campoEmpresa),
    el('button', { class: 'btn btn-destaque', type: 'submit' }, 'Começar'),
  );

  return el('main', { class: 'conteudo tela-identificacao' },
    el('img', { class: 'logo-marca', src: 'icons/logo-nord.png', alt: 'Nord Consult' }),
    el('h1', {}, 'Inspeções de conformidade Técnica/NR-10 – Nord Consult'),
    el('p', {}, 'Identifique-se para começar. Isso é pedido apenas uma vez.'),
    formulario,
  );
}
