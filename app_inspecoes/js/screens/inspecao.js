// Inspeção Geral — navegação por áreas (raiz) e sub-áreas (1 nível).
// Fluxo de campo: dentro de uma área, "NC + FOTO" cria a NC, abre a câmera
// e salva a foto comprimida — no máximo 3 toques até a foto tirada.

import {
  db, obterInspecao, obterArea, listarAreas, criarArea,
  listarNCsDaArea, criarNC, adicionarFoto, contarFotos,
} from '../db.js';
import { capturarFoto } from '../camera.js';
import { el, cabecalho, toast, formatarDataHora } from '../ui.js';

const ROTULO_TIPO = {
  geral: 'Geral',
  subestacoes: 'Subestações',
  paineis: 'Painéis',
  documental: 'Documental',
};

export async function telaInspecao(inspecaoId, areaId = null) {
  const inspecao = await obterInspecao(inspecaoId);
  if (!inspecao) { location.hash = '#/home'; return el('div'); }

  const [cliente, area] = await Promise.all([
    db.clientes.get(inspecao.clienteId),
    areaId ? obterArea(areaId) : null,
  ]);
  const areaRaiz = area && (area.parentId ?? null) === null;

  const titulo = area ? area.nome : (cliente ? cliente.nome : 'Inspeção');
  const subtitulo = area
    ? (cliente ? cliente.nome : '')
    : `${ROTULO_TIPO[inspecao.tipo] || inspecao.tipo} · ${formatarDataHora(inspecao.criadoEm)}`;
  const voltarPara = !area
    ? '#/home'
    : (area.parentId ?? null) === null
      ? `#/inspecao/${inspecaoId}`
      : `#/inspecao/${inspecaoId}/area/${area.parentId}`;

  const conteudo = el('main', { class: 'conteudo' });

  // ---- Sub-níveis: áreas na raiz; sub-áreas dentro de área raiz ----
  const podeTerFilhas = !area || areaRaiz; // sub-área não tem filhas (1 nível)
  if (podeTerFilhas) {
    const filhas = await listarAreas(inspecaoId, areaId);
    const rotulo = area ? 'Sub-áreas' : 'Áreas';
    conteudo.append(el('h2', {}, rotulo));

    if (filhas.length) {
      const contagens = await contagemNCsPorArea(inspecaoId);
      conteudo.append(el('div', { class: 'lista' },
        filhas.map((filha) => {
          const totalNCs = contagens.get(filha.id) || 0;
          return el('button', {
            class: 'cartao',
            onclick: () => { location.hash = `#/inspecao/${inspecaoId}/area/${filha.id}`; },
          },
            el('span', { class: 'principal' },
              el('span', { class: 'titulo' }, filha.nome)),
            totalNCs > 0 ? el('span', { class: 'selo selo-nc' }, `${totalNCs} NC`) : null,
            el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
          );
        }),
      ));
    } else {
      conteudo.append(el('p', { class: 'vazio' },
        area ? 'Nenhuma sub-área ainda.' : 'Crie a primeira área para começar (ex.: Produção, Almoxarifado).'));
    }

    const campoArea = el('input', { type: 'text', placeholder: area ? 'Nova sub-área' : 'Nova área' });
    const adicionar = async () => {
      const nome = campoArea.value.trim();
      if (!nome) { campoArea.focus(); return; }
      await criarArea(inspecaoId, nome, areaId);
      toast(`${area ? 'Sub-área' : 'Área'} "${nome}" criada.`);
      recarregar();
    };
    campoArea.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') adicionar(); });
    conteudo.append(el('div', { class: 'linha-form' },
      campoArea,
      el('button', { class: 'btn btn-primario', onclick: adicionar }, '+ Criar'),
    ));
  }

  // ---- NCs: só dentro de área ou sub-área ----
  if (area) {
    conteudo.append(el('h2', {}, 'Não conformidades'));

    const ncs = await listarNCsDaArea(areaId);
    if (ncs.length) {
      const cartoes = await Promise.all(ncs.map(async (nc) => {
        const fotos = await contarFotos(nc.id);
        return el('button', {
          class: 'cartao',
          onclick: () => { location.hash = `#/nc/${nc.id}`; },
        },
          el('span', { class: 'selo selo-nc' }, nc.numero),
          el('span', { class: 'principal' },
            el('span', { class: 'titulo' }, nc.descricao || 'Sem descrição'),
            el('span', { class: 'detalhe' }, `📷 ${fotos} foto${fotos === 1 ? '' : 's'} · ${formatarDataHora(nc.criadoEm)}`),
          ),
          el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
        );
      }));
      conteudo.append(el('div', { class: 'lista' }, cartoes));
    } else {
      conteudo.append(el('p', { class: 'vazio' }, 'Nenhuma NC registrada aqui.'));
    }

    // Botão principal de campo: 1 toque aqui + disparo + confirmação = 3 toques.
    conteudo.append(
      el('button', {
        class: 'btn btn-nc',
        onclick: async () => {
          try {
            const blob = await capturarFoto(); // abre a câmera imediatamente
            if (!blob) return; // câmera cancelada: não cria NC
            const ncId = await criarNC(inspecaoId, areaId);
            await adicionarFoto(ncId, blob);
            toast('NC registrada com foto. Salvo!');
            location.hash = `#/nc/${ncId}`;
          } catch (erro) {
            console.error(erro);
            toast('Não foi possível capturar a foto.');
          }
        },
      }, el('span', { class: 'icone' }, '📷'), 'NC + FOTO'),
      el('button', {
        class: 'btn btn-secundario',
        onclick: async () => {
          const ncId = await criarNC(inspecaoId, areaId);
          toast('NC registrada. Salvo!');
          location.hash = `#/nc/${ncId}`;
        },
      }, 'NC sem foto'),
    );
  }

  function recarregar() {
    telaInspecao(inspecaoId, areaId).then((novo) => {
      const app = document.getElementById('app');
      app.replaceChildren(...(Array.isArray(novo) ? novo : [novo]));
    });
  }

  return [cabecalho(titulo, voltarPara, subtitulo), conteudo];
}

/** Total de NCs por área, somando as NCs das sub-áreas na área-mãe. */
async function contagemNCsPorArea(inspecaoId) {
  const [areas, ncs] = await Promise.all([
    db.areas.where('inspecaoId').equals(inspecaoId).toArray(),
    db.ncs.where('inspecaoId').equals(inspecaoId).toArray(),
  ]);
  const paiDe = new Map(areas.map((a) => [a.id, a.parentId ?? null]));
  const contagens = new Map();
  for (const nc of ncs) {
    contagens.set(nc.areaId, (contagens.get(nc.areaId) || 0) + 1);
    const pai = paiDe.get(nc.areaId);
    if (pai !== null && pai !== undefined) {
      contagens.set(pai, (contagens.get(pai) || 0) + 1);
    }
  }
  return contagens;
}
