// Home — Nova inspeção / Retomar / Exportar + espaço usado no rodapé.

import { obterInspetor, listarInspecoesAbertas } from '../db.js';
import { textoEspacoUsado, estaPersistente } from '../storage.js';
import { el, cabecalho, toast } from '../ui.js';

export async function telaHome() {
  const [inspetor, abertas, espaco, persistente] = await Promise.all([
    obterInspetor(),
    listarInspecoesAbertas(),
    textoEspacoUsado(),
    estaPersistente(),
  ]);

  const rodape = el('div', { class: 'info-armazenamento' },
    espaco ? el('div', {}, `💾 ${espaco}`) : null,
    persistente
      ? null
      : el('div', { class: 'aviso-persistencia' },
          '⚠️ Armazenamento não persistente — instale o app na tela inicial.'),
  );

  return [
    cabecalho('Nord Consult — Inspeções NR-10', null, `Inspetor: ${inspetor.nome}`),
    el('main', { class: 'conteudo' },
      el('button', {
        class: 'btn btn-destaque btn-grande',
        onclick: () => { location.hash = '#/nova'; },
      }, el('span', { class: 'icone' }, '📋'), 'Nova inspeção'),

      el('button', {
        class: 'btn btn-primario btn-grande',
        disabled: abertas.length === 0,
        onclick: () => { location.hash = '#/retomar'; },
      },
        el('span', { class: 'icone' }, '▶️'),
        abertas.length > 0
          ? `Retomar inspeção (${abertas.length} aberta${abertas.length > 1 ? 's' : ''})`
          : 'Retomar inspeção',
      ),

      el('button', {
        class: 'btn btn-secundario btn-grande',
        onclick: () => toast('Exportação disponível na Fase 3.'),
      }, el('span', { class: 'icone' }, '📦'), 'Exportar'),

      rodape,
    ),
  ];
}
