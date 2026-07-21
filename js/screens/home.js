// Home: menu principal + rodapé informativo.

import { el, cabecalho } from '../ui.js';
import { VERSAO_APP } from '../versao.js';
import { infoArmazenamento, formatarBytes } from '../storage.js';
import { listarInspecoes } from '../db.js';

export async function telaHome() {
  const inspecoes = await listarInspecoes();
  const emAndamento = inspecoes.filter((i) => i.status === 'em-andamento').length;

  const rodape = el(
    'div',
    { class: 'rodape-info' },
    el('div', {}, `Versão ${VERSAO_APP}`),
    el('div', { class: 'espaco' }, 'Calculando espaço usado…')
  );

  // Preenche o espaço usado sem travar a montagem da tela.
  infoArmazenamento().then(({ usado, persistente }) => {
    const linhaEspaco = rodape.querySelector('.espaco');
    linhaEspaco.textContent = usado === null ? '' : `Espaço usado: ${formatarBytes(usado)}`;
    if (persistente === false) {
      rodape.append(
        el(
          'div',
          { class: 'aviso' },
          'Atenção: o armazenamento não é persistente. Exporte seus dados com frequência.'
        )
      );
    }
  });

  return [
    cabecalho('Continuidade de Aterramento', { subtitulo: 'Nord Consult' }),
    el(
      'main',
      { class: 'conteudo' },
      el('a', { class: 'btn btn-primario btn-grande', href: '#/nova-inspecao' }, 'Nova inspeção'),
      el(
        'a',
        { class: 'btn btn-secundario btn-grande', href: '#/inspecoes' },
        'Inspeções',
        emAndamento > 0 ? el('span', { class: 'selo' }, String(emAndamento)) : null
      ),
      rodape
    ),
  ];
}
