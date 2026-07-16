// Tela de uma NC — fotos (máx. 20), descrição opcional (autosave) e áudio.

import {
  obterNC, obterArea, atualizarDescricaoNC, excluirNC,
  listarFotos, adicionarFoto, excluirFoto, MAX_FOTOS_POR_NC,
  listarAudios, adicionarAudio, excluirAudio,
} from '../db.js';
import { capturarFoto } from '../camera.js';
import { GravadorAudio, gravacaoSuportada } from '../audio.js';
import { el, cabecalho, toast, debounce, formatarDataHora } from '../ui.js';

export async function telaNC(ncId) {
  const nc = await obterNC(ncId);
  if (!nc) { location.hash = '#/home'; return el('div'); }
  const deChecklist = nc.areaId === null || nc.areaId === undefined;
  const area = deChecklist ? null : await obterArea(nc.areaId);
  const voltarPara = nc.painelId
    ? `#/inspecao/${nc.inspecaoId}/painel/${nc.painelId}`
    : deChecklist
      ? `#/inspecao/${nc.inspecaoId}`
      : `#/inspecao/${nc.inspecaoId}/area/${nc.areaId}`;

  const conteudo = el('main', { class: 'conteudo' });

  // ---------- Fotos ----------
  const tituloFotos = el('h2', {});
  const grade = el('div', { class: 'grade-fotos' });
  const botaoFoto = el('button', {
    class: 'btn btn-nc',
    onclick: async () => {
      try {
        const blob = await capturarFoto();
        if (!blob) return;
        await adicionarFoto(ncId, blob);
        toast('Foto salva!');
        await renderizarFotos();
      } catch (erro) {
        console.error(erro);
        toast('Não foi possível capturar a foto.');
      }
    },
  }, el('span', { class: 'icone' }, '📷'), 'Adicionar foto');

  async function renderizarFotos() {
    const fotos = await listarFotos(ncId);
    tituloFotos.textContent = `Fotos (${fotos.length}/${MAX_FOTOS_POR_NC})`;
    botaoFoto.disabled = fotos.length >= MAX_FOTOS_POR_NC;
    grade.replaceChildren(...fotos.map((foto) => {
      const url = URL.createObjectURL(foto.blob);
      const img = el('img', { src: url, alt: 'Foto da NC' });
      img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
      return el('button', {
        class: 'miniatura',
        onclick: () => abrirVisor(foto, renderizarFotos),
      }, img);
    }));
  }
  await renderizarFotos();

  // ---------- Descrição (autosave) ----------
  const campoDescricao = el('textarea', {
    id: 'descricao',
    placeholder: 'Descreva a não conformidade (opcional)…',
  });
  campoDescricao.value = nc.descricao || '';
  const salvarDescricao = debounce(async () => {
    await atualizarDescricaoNC(ncId, campoDescricao.value);
  }, 400);
  campoDescricao.addEventListener('input', salvarDescricao);
  campoDescricao.addEventListener('blur', () => atualizarDescricaoNC(ncId, campoDescricao.value));

  // ---------- Áudio ----------
  const listaAudios = el('div', { class: 'lista' });
  async function renderizarAudios() {
    const audios = await listarAudios(ncId);
    listaAudios.replaceChildren(...audios.map((audio) => {
      const player = el('audio', { controls: true, preload: 'metadata' });
      player.src = URL.createObjectURL(audio.blob);
      return el('div', { class: 'item-audio' },
        player,
        el('button', {
          class: 'btn btn-perigo', 'aria-label': 'Excluir áudio',
          onclick: async () => {
            if (!confirm('Excluir este áudio?')) return;
            await excluirAudio(audio.id);
            toast('Áudio excluído.');
            renderizarAudios();
          },
        }, '🗑️'),
      );
    }));
  }
  await renderizarAudios();

  let gravador = null;
  let cronometro = null;
  const botaoAudio = el('button', {
    class: 'btn btn-secundario',
    disabled: !gravacaoSuportada(),
    onclick: async () => {
      if (!gravador || !gravador.gravando) {
        try {
          gravador = new GravadorAudio();
          await gravador.iniciar();
        } catch {
          toast('Microfone indisponível ou permissão negada.');
          gravador = null;
          return;
        }
        botaoAudio.classList.add('gravando', 'btn-perigo');
        botaoAudio.classList.remove('btn-secundario');
        const inicio = Date.now();
        const atualizar = () => {
          const s = Math.floor((Date.now() - inicio) / 1000);
          botaoAudio.textContent = `⏹️ Parar gravação (${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')})`;
        };
        atualizar();
        cronometro = setInterval(atualizar, 1000);
      } else {
        clearInterval(cronometro);
        const { blob, mime } = await gravador.parar();
        gravador = null;
        botaoAudio.classList.remove('gravando', 'btn-perigo');
        botaoAudio.classList.add('btn-secundario');
        botaoAudio.textContent = '🎙️ Gravar áudio';
        if (blob.size > 0) {
          await adicionarAudio(ncId, blob, mime);
          toast('Áudio salvo!');
          renderizarAudios();
        }
      }
    },
  }, gravacaoSuportada() ? '🎙️ Gravar áudio' : '🎙️ Gravação não suportada');

  // Se o usuário sair da tela gravando, descarta a gravação e solta o microfone.
  window.addEventListener('hashchange', () => {
    clearInterval(cronometro);
    if (gravador) gravador.cancelar();
  }, { once: true });

  // ---------- Montagem ----------
  conteudo.append(
    tituloFotos, grade, botaoFoto,
    el('h2', {}, 'Descrição'),
    el('div', {}, campoDescricao),
    el('h2', {}, 'Áudio'),
    listaAudios, botaoAudio,
    el('h2', {}, 'Ações'),
    el('button', {
      class: 'btn btn-perigo',
      onclick: async () => {
        if (!confirm(`Excluir a ${nc.numero} com todas as fotos e áudios?`)) return;
        await excluirNC(ncId);
        toast(`${nc.numero} excluída.`);
        location.hash = voltarPara;
      },
    }, '🗑️ Excluir esta NC'),
    el('p', { class: 'info-armazenamento' },
      `Criada em ${formatarDataHora(nc.criadoEm)} · salvamento automático ativo`),
  );

  const subtitulo = deChecklist ? (nc.itemTexto || 'Item de checklist') : (area ? area.nome : '');
  return [cabecalho(nc.numero, voltarPara, subtitulo), conteudo];
}

/** Visualização em tela cheia com opção de excluir a foto. */
function abrirVisor(foto, aoMudar) {
  const url = URL.createObjectURL(foto.blob);
  const visor = el('div', { class: 'visor-foto', role: 'dialog', 'aria-label': 'Foto ampliada' });
  const fechar = () => { URL.revokeObjectURL(url); visor.remove(); };

  visor.append(
    el('img', { src: url, alt: 'Foto da NC ampliada' }),
    el('div', { class: 'acoes' },
      el('button', {
        class: 'btn btn-perigo',
        onclick: async () => {
          if (!confirm('Excluir esta foto?')) return;
          await excluirFoto(foto.id);
          toast('Foto excluída.');
          fechar();
          aoMudar();
        },
      }, '🗑️ Excluir'),
      el('button', { class: 'btn btn-secundario', onclick: fechar }, 'Fechar'),
    ),
  );
  document.body.append(visor);
}
