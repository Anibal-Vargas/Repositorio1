// Exportar — Fase 3: lista inspeções (abertas e finalizadas), gera o
// pacote ZIP e permite finalizar/reabrir cada inspeção.

import {
  db, listarInspecoesAbertas, listarInspecoesFinalizadas,
  progressoInspecao, finalizarInspecao, reabrirInspecao, excluirInspecao,
} from '../db.js';
import { gerarZip } from '../export.js';
import { LADO_REDUZIDO } from '../camera.js';
import { el, cabecalho, toast, formatarDataHora, menuAcoes } from '../ui.js';

const ROTULO_TIPO = {
  geral: 'Geral',
  subestacoes: 'Subestações',
  paineis: 'Painéis',
  documental: 'Documental',
};

export async function telaExportar() {
  const conteudo = el('main', { class: 'conteudo' });
  await montar(conteudo);
  return [cabecalho('Exportar', '#/home'), conteudo];
}

async function montar(conteudo) {
  const [abertas, finalizadas] = await Promise.all([
    listarInspecoesAbertas(),
    listarInspecoesFinalizadas(),
  ]);

  conteudo.replaceChildren();

  if (!abertas.length && !finalizadas.length) {
    conteudo.append(el('p', { class: 'vazio' },
      'Nenhuma inspeção para exportar. Crie uma na tela inicial.'));
    return;
  }

  if (abertas.length) {
    conteudo.append(el('h2', {}, 'Em andamento'));
    for (const inspecao of abertas) conteudo.append(await cartaoInspecao(inspecao, conteudo));
  }
  if (finalizadas.length) {
    conteudo.append(el('h2', {}, 'Finalizadas'));
    for (const inspecao of finalizadas) conteudo.append(await cartaoInspecao(inspecao, conteudo));
  }

  conteudo.append(el('p', { class: 'info-armazenamento' },
    'O pacote .zip contém a pasta NCs (data → área → sub-área → NC, com fotos, áudios e descrições), o relatório (relatorio.html) e os dados (dados.json).'));
}

async function cartaoInspecao(inspecao, conteudo) {
  const [cliente, progresso] = await Promise.all([
    db.clientes.get(inspecao.clienteId),
    progressoInspecao(inspecao.id),
  ]);
  const aberta = inspecao.status === 'aberta';

  const botaoExportar = el('button', { class: 'btn btn-primario' }, '📤 Exportar (.zip)');
  botaoExportar.addEventListener('click', () => exportar(inspecao, cliente, botaoExportar));

  const botaoStatus = el('button', {
    class: 'btn btn-secundario',
    onclick: async () => {
      if (aberta) {
        if (!confirm('Finalizar esta inspeção? Ela sai da lista "Retomar", mas continua aqui para exportação e pode ser reaberta.')) return;
        await finalizarInspecao(inspecao.id);
        toast('Inspeção finalizada.');
      } else {
        await reabrirInspecao(inspecao.id);
        toast('Inspeção reaberta.');
      }
      montar(conteudo);
    },
  }, aberta ? '✔️ Finalizar' : '↩️ Reabrir');

  // Excluir: só para inspeções finalizadas (evita apagar trabalho em andamento).
  const botaoExcluir = aberta ? null : el('button', {
    class: 'btn btn-perigo',
    onclick: async () => {
      const nome = cliente ? cliente.nome : 'esta inspeção';
      if (!confirm(
        `Excluir DEFINITIVAMENTE a inspeção de "${nome}"?\n\n` +
        `Serão apagados ${progresso.ncs} NC(s) e ${progresso.fotos} foto(s), ` +
        'junto com áudios, descrições e checklists. Esta ação não pode ser desfeita.\n\n' +
        'Dica: exporte o pacote .zip antes, se ainda precisar dos dados.')) return;
      await excluirInspecao(inspecao.id);
      toast('Inspeção excluída.');
      montar(conteudo);
    },
  }, '🗑️ Excluir');

  return el('div', { class: 'cartao cartao-coluna' },
    el('span', { class: 'principal' },
      el('span', { class: 'titulo' }, cliente ? cliente.nome : 'Cliente removido'),
      el('span', { class: 'detalhe' },
        `${ROTULO_TIPO[inspecao.tipo] || inspecao.tipo} · iniciada em ${formatarDataHora(inspecao.criadoEm)}`),
      el('span', { class: 'detalhe' },
        `📍 ${progresso.areas} área(s) · ⚠️ ${progresso.ncs} NC(s) · 📷 ${progresso.fotos} foto(s)`),
    ),
    el('div', { class: 'acoes-linha' }, botaoExportar, botaoStatus, botaoExcluir),
  );
}

// Marca a exportação em andamento. Se o app fechar no meio (ex.: o aparelho
// ficou sem memória), a marca sobra e a próxima tentativa dessa inspeção
// oferece gerar com fotos reduzidas.
const CHAVE_TENTATIVA = 'exportacaoEmAndamento';

function lerTentativa() {
  try { return JSON.parse(localStorage.getItem(CHAVE_TENTATIVA)); } catch { return null; }
}

function marcarTentativa(valor) {
  try {
    if (valor) localStorage.setItem(CHAVE_TENTATIVA, JSON.stringify(valor));
    else localStorage.removeItem(CHAVE_TENTATIVA);
  } catch { /* sem armazenamento local: segue sem a marca */ }
}

/**
 * Gera e entrega o .zip ÚNICO da inspeção. Se não for possível com as
 * fotos originais, avisa e oferece gerar com as fotos reduzidas.
 */
async function exportar(inspecao, cliente, botao, reduzirFotos = false) {
  if (!reduzirFotos) {
    const anterior = lerTentativa();
    if (anterior && anterior.inspecaoId === inspecao.id && !anterior.reduzirFotos) {
      marcarTentativa(null);
      oferecerReducao(inspecao, cliente, botao, 'interrompida');
      return;
    }
  }

  const rotuloOriginal = botao.textContent;
  botao.disabled = true;
  marcarTentativa({ inspecaoId: inspecao.id, reduzirFotos, inicio: Date.now() });
  let pacote;
  try {
    pacote = await gerarZip(inspecao.id, {
      reduzirFotos,
      aoProgredir: (etapa, valor) => {
        botao.textContent = etapa === 'reduzindo'
          ? `Reduzindo fotos ${valor}…`
          : `Gerando… ${Math.round(valor)}%`;
      },
    });
  } catch (erro) {
    console.error(erro);
    if (reduzirFotos) {
      toast('Não foi possível gerar o pacote, nem com as fotos reduzidas.', 4000);
    } else {
      oferecerReducao(inspecao, cliente, botao, 'falha');
    }
    return;
  } finally {
    marcarTentativa(null);
    botao.disabled = false;
    botao.textContent = rotuloOriginal;
  }
  await entregar(pacote, cliente, reduzirFotos);
}

/** Aviso com a opção de gerar o arquivo único com as fotos reduzidas. */
function oferecerReducao(inspecao, cliente, botao, motivo) {
  const explicacaoReducao =
    `Posso gerar o arquivo único com as fotos reduzidas (lado maior ${LADO_REDUZIDO} px) ` +
    'só nesta exportação. As fotos originais continuam guardadas no aparelho.';
  const reduzir = {
    rotulo: '📉 Gerar com fotos reduzidas',
    principal: true,
    aoTocar: () => exportar(inspecao, cliente, botao, true),
  };
  const tentarDeNovo = {
    rotulo: 'Tentar de novo com fotos originais',
    aoTocar: () => exportar(inspecao, cliente, botao, false),
  };
  if (motivo === 'interrompida') {
    menuAcoes('A última exportação não terminou', [reduzir, tentarDeNovo],
      'A tentativa anterior de exportar esta inspeção foi interrompida ' +
      `(o app pode ter fechado por falta de memória).\n\n${explicacaoReducao}`);
  } else {
    menuAcoes('Não foi possível gerar o pacote', [reduzir, tentarDeNovo],
      'O aparelho não conseguiu montar o arquivo com as fotos originais ' +
      `(pode ter faltado memória).\n\n${explicacaoReducao}`);
  }
}

async function entregar({ blob, nomeArquivo }, cliente, reduzirFotos) {
  const sufixo = reduzirFotos ? ' (fotos reduzidas)' : '';
  // Android: folha de compartilhamento (Drive, Arquivos, WhatsApp…).
  // Sem suporte (ou se falhar): download direto para Downloads.
  const arquivo = new File([blob], nomeArquivo, { type: 'application/zip' });
  if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({
        files: [arquivo],
        title: `Inspeção NR-10 — ${cliente ? cliente.nome : ''}`,
      });
      toast(`Pacote compartilhado${sufixo}.`);
      return;
    } catch (erro) {
      if (erro.name === 'AbortError') { toast('Compartilhamento cancelado.'); return; }
      // NotAllowedError, arquivo grande demais para compartilhar etc.: baixa.
    }
  }
  baixar(blob, nomeArquivo);
  toast(`Pacote salvo em Downloads${sufixo}.`);
}

function baixar(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const ancora = el('a', { href: url, download: nomeArquivo });
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
