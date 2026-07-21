// Roteador hash-based + registro do Service Worker.

import { toast } from './ui.js';
import { garantirPersistencia } from './storage.js';
import { telaInicio } from './screens/inicio.js';
import { telaHome } from './screens/home.js';
import { telaNovaInspecao } from './screens/novaInspecao.js';
import { telaInspecoes } from './screens/inspecoes.js';
import { telaInspecao } from './screens/inspecao.js';
import { telaEscolherSetor, telaEquipamentosDoSetor } from './screens/escolherEquipamento.js';
import { telaRegistro } from './screens/registro.js';
import { telaExportar } from './screens/exportar.js';

// Cada rota mapeia uma regex do location.hash para uma função de tela.
// Os grupos capturados viram parâmetros da função.
const ROTAS = [
  { padrao: /^#?\/?$/, tela: telaInicio },
  { padrao: /^#\/home$/, tela: telaHome },
  { padrao: /^#\/nova-inspecao$/, tela: telaNovaInspecao },
  { padrao: /^#\/inspecoes$/, tela: telaInspecoes },
  { padrao: /^#\/inspecao\/(\d+)$/, tela: telaInspecao },
  { padrao: /^#\/inspecao\/(\d+)\/equipamentos$/, tela: telaEscolherSetor },
  { padrao: /^#\/inspecao\/(\d+)\/setor\/(\d+)$/, tela: telaEquipamentosDoSetor },
  { padrao: /^#\/inspecao\/(\d+)\/equipamento\/(\d+)$/, tela: telaRegistro },
  { padrao: /^#\/inspecao\/(\d+)\/exportar$/, tela: telaExportar },
];

async function navegar() {
  const app = document.getElementById('app');
  const hash = location.hash || '#/';

  // A tela de abertura mostra a logo em destaque — sem marca-d'água nela.
  document.body.classList.toggle('sem-marca', /^#?\/?$/.test(hash));

  for (const rota of ROTAS) {
    const combinacao = hash.match(rota.padrao);
    if (!combinacao) continue;
    try {
      const elementos = await rota.tela(...combinacao.slice(1));
      app.replaceChildren(...elementos);
      window.scrollTo(0, 0);
    } catch (erro) {
      console.error('Erro ao montar a tela:', erro);
      toast('Erro ao abrir a tela.');
    }
    return;
  }

  // Rota desconhecida: volta para a abertura.
  location.hash = '#/';
}

window.addEventListener('hashchange', navegar);

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registro = await navigator.serviceWorker.register('sw.js');

    // Quando um SW novo assume (skipWaiting + clients.claim) no lugar de um
    // antigo, recarrega a página uma única vez e avisa o usuário. Na primeira
    // instalação não há SW anterior — não recarrega, para não perder o que o
    // usuário estiver digitando.
    let haviaControlador = !!navigator.serviceWorker.controller;
    let recarregou = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!haviaControlador) {
        haviaControlador = true;
        return;
      }
      if (recarregou || !navigator.serviceWorker.controller) return;
      recarregou = true;
      sessionStorage.setItem('avisoAtualizacao', '1');
      location.reload();
    });

    registro.update().catch(() => {});
  } catch (erro) {
    console.warn('Service Worker não registrado:', erro);
  }
}

function avisarSeAtualizou() {
  if (sessionStorage.getItem('avisoAtualizacao') === '1') {
    sessionStorage.removeItem('avisoAtualizacao');
    toast('Aplicativo atualizado.');
  }
}

navegar();
registrarServiceWorker();
avisarSeAtualizou();
garantirPersistencia();
