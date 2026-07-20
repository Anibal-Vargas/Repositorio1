// Exportar — Fase 3: lista inspeções (abertas e finalizadas), gera o
// pacote ZIP e permite finalizar/reabrir cada inspeção.

import {
  db, listarInspecoesAbertas, listarInspecoesFinalizadas,
  progressoInspecao, finalizarInspecao, reabrirInspecao, excluirInspecao,
} from '../db.js';
import { gerarZips } from '../export.js';
import { el, cabecalho, toast, formatarDataHora } from '../ui.js';

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

async function exportar(inspecao, cliente, botao) {
  const rotuloOriginal = botao.textContent;
  botao.disabled = true;
  try {
    const { pacotes } = await gerarZips(inspecao.id, (parte, total, pct) => {
      botao.textContent = total > 1
        ? `Gerando parte ${parte}/${total}… ${Math.round(pct)}%`
        : `Gerando… ${Math.round(pct)}%`;
    });
    const plural = pacotes.length > 1 ? `s (${pacotes.length} partes)` : '';

    // Android: folha de compartilhamento (WhatsApp, Drive, e-mail…).
    // Sem suporte (ou se falhar): download direto dos arquivos.
    const arquivos = pacotes.map((p) => new File([p.blob], p.nomeArquivo, { type: 'application/zip' }));
    if (navigator.canShare && navigator.canShare({ files: arquivos })) {
      try {
        await navigator.share({
          files: arquivos,
          title: `Inspeção NR-10 — ${cliente ? cliente.nome : ''}`,
        });
        toast(`Pacote${plural} compartilhado${pacotes.length > 1 ? 's' : ''}.`);
        return;
      } catch (erro) {
        if (erro.name === 'AbortError') { toast('Compartilhamento cancelado.'); return; }
        // NotAllowedError etc.: cai para o download.
      }
    }
    for (const pacote of pacotes) {
      baixar(pacote.blob, pacote.nomeArquivo);
      await new Promise((r) => setTimeout(r, 500));
    }
    toast(`Pacote${plural} salvo${pacotes.length > 1 ? 's' : ''} em Downloads.`);
  } catch (erro) {
    console.error(erro);
    toast('Falha ao gerar o pacote. Tente novamente.');
  } finally {
    botao.disabled = false;
    botao.textContent = rotuloOriginal;
  }
}

function baixar(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const ancora = el('a', { href: url, download: nomeArquivo });
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
