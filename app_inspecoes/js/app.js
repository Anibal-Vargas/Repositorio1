// app.js — ponto de entrada: roteador por hash + registro do Service Worker.

import { toast } from './ui.js';
import { telaInicio } from './screens/inicio.js';
import { telaHome } from './screens/home.js';
import { telaNovaInspecao } from './screens/novaInspecao.js';
import { telaInspecao } from './screens/inspecao.js';
import { telaNC } from './screens/nc.js';
import { telaRetomar } from './screens/retomar.js';
import { telaExportar } from './screens/exportar.js';
import { telaPainel } from './screens/checklist.js';

// Cada rota mapeia para uma função async tela(container, ...paramsCapturados).
const ROTAS = [
  { padrao: /^#\/inicio$/, tela: telaInicio },
  { padrao: /^#\/home$/, tela: telaHome },
  { padrao: /^#\/nova$/, tela: telaNovaInspecao },
  { padrao: /^#\/retomar$/, tela: telaRetomar },
  { padrao: /^#\/exportar$/, tela: telaExportar },
  { padrao: /^#\/inspecao\/(\d+)$/, tela: telaInspecao },
  { padrao: /^#\/inspecao\/(\d+)\/area\/(\d+)$/, tela: telaInspecao },
  { padrao: /^#\/inspecao\/(\d+)\/painel\/(\d+)$/, tela: telaPainel },
  { padrao: /^#\/nc\/(\d+)$/, tela: telaNC },
];

let tokenNavegacao = 0;

async function renderizar() {
  const app = document.getElementById('app');
  const hash = location.hash || '#/home';
  const token = ++tokenNavegacao;

  for (const rota of ROTAS) {
    const combinacao = hash.match(rota.padrao);
    if (!combinacao) continue;
    const params = combinacao.slice(1).map(Number);
    try {
      const conteudo = await rota.tela(...params);
      if (token !== tokenNavegacao) return; // usuário já navegou para outra tela
      app.replaceChildren(...(Array.isArray(conteudo) ? conteudo : [conteudo]));
      app.scrollTop = 0;
      window.scrollTo(0, 0);
    } catch (erro) {
      console.error(erro);
      if (token === tokenNavegacao) toast('Erro ao abrir a tela. Tente novamente.');
    }
    return;
  }
  location.hash = '#/home';
}

async function iniciar() {
  registrarServiceWorker();

  // Abertura "fria" (sem rota na URL) mostra a tela de início; um reload
  // no meio do uso (ex.: atualização automática) mantém a tela atual.
  // '#/identificacao' existia até a v1.3.
  if (!location.hash || location.hash === '#/identificacao') {
    location.hash = '#/inicio';
  }

  window.addEventListener('hashchange', renderizar);
  renderizar();
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('sw.js').then((registro) => {
    // Procura atualização a cada retorno ao app (o SW novo usa skipWaiting).
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registro.update();
    });
  }).catch((erro) => console.warn('Service Worker não registrado:', erro));

  // Quando um SW novo assume, recarrega uma única vez para pegar a versão nova.
  // Na primeira instalação (claim sem controlador anterior) não há o que
  // recarregar — recarregar aí interromperia o usuário no meio de uma ação.
  const tinhaControlador = !!navigator.serviceWorker.controller;
  let recarregou = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!tinhaControlador || recarregou) return;
    recarregou = true;
    toast('Aplicativo atualizado.');
    setTimeout(() => location.reload(), 600);
  });
}

iniciar();
