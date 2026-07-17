// Inspeção Geral — navegação por áreas (raiz) e sub-áreas (1 nível).
// Fluxo de campo: dentro de uma área, "NC + FOTO" cria a NC, abre a câmera
// e salva a foto comprimida — no máximo 3 toques até a foto tirada.

import {
  db, obterInspecao, obterArea, listarAreas, criarArea,
  listarNCsDaArea, criarNC, adicionarFoto, contarFotos,
  listarPaineis, criarPainel, obterRespostas, listarItensExtras,
} from '../db.js';
import { totalItens } from '../checklists.js';
import { capturarFoto } from '../camera.js';
import { telaChecklist } from './checklist.js';
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

  const tipo = inspecao.tipo || 'geral';

  // Painéis navega por áreas/sub-áreas com painéis dentro delas, cada um
  // com o próprio checklist. Subestações e Documental: um checklist por
  // inspeção, tela própria.
  const UNIDADES = {
    paineis: {
      plural: 'Painéis', icone: '🎛️',
      placeholder: 'Nome do painel (ex.: QGBT-01)',
      dicaRaiz: 'Crie a primeira área para começar (ex.: Produção). Os painéis ficam dentro das áreas.',
      vazio: 'Nenhum painel cadastrado aqui.',
      criado: (nome) => `Painel "${nome}" criado.`,
    },
  };
  const unidade = UNIDADES[tipo] || null;

  // Subestações: cadastro das subestações direto na raiz (sem áreas);
  // cada uma tem o próprio checklist. Inspeções antigas (checklist único,
  // respostas sem unidade) seguem no formato antigo.
  if (tipo === 'subestacoes') {
    const respostasSE = await obterRespostas(inspecaoId);
    if (respostasSE.some((r) => (r.painelId ?? 0) === 0)) return telaChecklist(inspecao);
    return telaSubestacoes(inspecao);
  }

  if (tipo !== 'geral' && !unidade) return telaChecklist(inspecao);
  const ehPaineis = !!unidade;

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
        area ? 'Nenhuma sub-área ainda.'
          : unidade
            ? unidade.dicaRaiz
            : 'Crie a primeira área para começar (ex.: Produção, Almoxarifado).'));
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

  // ---- Painéis (tipo Painéis): dentro de área ou sub-área ----
  if (area && ehPaineis) {
    conteudo.append(el('h2', {}, unidade.plural));

    const paineis = await listarPaineis(inspecaoId, areaId);
    if (paineis.length) {
      const [respostas, extras, ncsTodas] = await Promise.all([
        obterRespostas(inspecaoId),
        listarItensExtras(inspecaoId),
        db.ncs.where('inspecaoId').equals(inspecaoId).toArray(),
      ]);
      conteudo.append(el('div', { class: 'lista' },
        paineis.map((painel) => {
          const doPainel = respostas.filter((r) => r.painelId === painel.id);
          const verificados = doPainel.filter((r) => r.status).length;
          const total = totalItens(tipo) +
            extras.filter((e) => e.painelId === painel.id).length;
          const ncsDoPainel = ncsTodas.filter((nc) => nc.painelId === painel.id).length;
          return el('button', {
            class: 'cartao',
            onclick: () => { location.hash = `#/inspecao/${inspecaoId}/painel/${painel.id}`; },
          },
            el('span', { 'aria-hidden': 'true', style: 'font-size:1.3rem' }, unidade.icone),
            el('span', { class: 'principal' },
              el('span', { class: 'titulo' }, painel.nome),
              el('span', { class: 'detalhe' },
                `✅ ${verificados} de ${total} itens` +
                (ncsDoPainel ? ` · ⚠️ ${ncsDoPainel} NC` : '')),
            ),
            el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
          );
        }),
      ));
    } else {
      conteudo.append(el('p', { class: 'vazio' }, unidade.vazio));
    }

    const campoPainel = el('input', { type: 'text', placeholder: unidade.placeholder });
    const adicionarPainel = async () => {
      const nome = campoPainel.value.trim();
      if (!nome) { campoPainel.focus(); return; }
      await criarPainel(inspecaoId, areaId, nome);
      toast(unidade.criado(nome));
      recarregar();
    };
    campoPainel.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') adicionarPainel(); });
    conteudo.append(el('div', { class: 'linha-form' },
      campoPainel,
      el('button', { class: 'btn btn-primario', onclick: adicionarPainel }, '+ Criar'),
    ));
  }

  // ---- NCs: só dentro de área ou sub-área (inspeção Geral) ----
  if (area && !ehPaineis) {
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

/** Subestações da inspeção: cadastro + acesso ao checklist de cada uma. */
async function telaSubestacoes(inspecao) {
  const inspecaoId = inspecao.id;
  const [cliente, subestacoes, respostas, extras, ncsTodas] = await Promise.all([
    db.clientes.get(inspecao.clienteId),
    listarPaineis(inspecaoId, null),
    obterRespostas(inspecaoId),
    listarItensExtras(inspecaoId),
    db.ncs.where('inspecaoId').equals(inspecaoId).toArray(),
  ]);

  const conteudo = el('main', { class: 'conteudo' });
  conteudo.append(el('h2', {}, 'Subestações'));

  if (subestacoes.length) {
    conteudo.append(el('div', { class: 'lista' },
      subestacoes.map((se) => {
        const verificados = respostas.filter((r) => r.painelId === se.id && r.status).length;
        const total = totalItens('subestacoes') +
          extras.filter((e) => e.painelId === se.id).length;
        const ncsDaSE = ncsTodas.filter((nc) => nc.painelId === se.id).length;
        return el('button', {
          class: 'cartao',
          onclick: () => { location.hash = `#/inspecao/${inspecaoId}/painel/${se.id}`; },
        },
          el('span', { 'aria-hidden': 'true', style: 'font-size:1.3rem' }, '⚡'),
          el('span', { class: 'principal' },
            el('span', { class: 'titulo' }, se.nome),
            el('span', { class: 'detalhe' },
              `✅ ${verificados} de ${total} itens` +
              (ncsDaSE ? ` · ⚠️ ${ncsDaSE} NC` : '')),
          ),
          el('span', { class: 'seta', 'aria-hidden': 'true' }, '›'),
        );
      }),
    ));
  } else {
    conteudo.append(el('p', { class: 'vazio' },
      'Cadastre a primeira subestação para abrir o checklist dela.'));
  }

  const campoSE = el('input', { type: 'text', placeholder: 'Nome da subestação (ex.: SE-01)' });
  const adicionarSE = async () => {
    const nome = campoSE.value.trim();
    if (!nome) { campoSE.focus(); return; }
    await criarPainel(inspecaoId, null, nome);
    toast(`Subestação "${nome}" criada.`);
    telaSubestacoes(inspecao).then((novo) => {
      document.getElementById('app').replaceChildren(...novo);
    });
  };
  campoSE.addEventListener('keydown', (evento) => { if (evento.key === 'Enter') adicionarSE(); });
  conteudo.append(el('div', { class: 'linha-form' },
    campoSE,
    el('button', { class: 'btn btn-primario', onclick: adicionarSE }, '+ Criar'),
  ));

  return [
    cabecalho(cliente ? cliente.nome : 'Inspeção', '#/home',
      `Subestações · ${formatarDataHora(inspecao.criadoEm)}`),
    conteudo,
  ];
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
