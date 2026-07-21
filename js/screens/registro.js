// Registro de uma máquina/equipamento na inspeção:
// fotos por categoria (01 a 04), áudios (05) e observação (06).

import { el, cabecalho, toast, debounce, formatarDataHora } from '../ui.js';
import {
  obterInspecao,
  obterEquipamento,
  obterRegistro,
  atualizarRegistro,
  removerEquipamentoDaInspecao,
  listarFotos,
  adicionarFoto,
  excluirFoto,
  listarAudios,
  adicionarAudio,
  excluirAudio,
  CATEGORIAS_FOTO,
} from '../db.js';

// Reduz a foto para no máximo `ladoMaximo` px no lado maior (JPEG), poupando espaço.
async function comprimirFoto(arquivo, ladoMaximo = 1600, qualidade = 0.82) {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);
    const tela = document.createElement('canvas');
    tela.width = largura;
    tela.height = altura;
    tela.getContext('2d').drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();
    const blob = await new Promise((resolver) => tela.toBlob(resolver, 'image/jpeg', qualidade));
    return blob || arquivo;
  } catch {
    return arquivo; // formato não suportado pelo canvas: guarda o original
  }
}

export async function telaRegistro(inspecaoId, equipamentoId) {
  const inspecao = await obterInspecao(inspecaoId);
  const equipamento = await obterEquipamento(equipamentoId);
  const registro = inspecao && equipamento ? await obterRegistro(inspecaoId, equipamentoId) : null;
  if (!inspecao || !equipamento || !registro) {
    toast('Máquina/equipamento não encontrado nesta inspeção.');
    location.hash = `#/inspecao/${inspecaoId}`;
    return [];
  }
  const somenteLeitura = inspecao.status === 'finalizada';
  const fotos = await listarFotos(inspecaoId, equipamentoId);
  const audios = await listarAudios(inspecaoId, equipamentoId);
  const urlsCriadas = [];

  window.addEventListener(
    'hashchange',
    () => urlsCriadas.forEach((url) => URL.revokeObjectURL(url)),
    { once: true }
  );

  /* ---------- Fotos por categoria ---------- */

  function abrirVisor(foto, url, aoExcluir) {
    const visor = el(
      'div',
      { class: 'visor-foto' },
      el('img', { src: url, alt: 'Foto ampliada' }),
      el(
        'div',
        { class: 'acoes' },
        !somenteLeitura
          ? el(
              'button',
              {
                class: 'btn btn-perigo',
                onclick: async () => {
                  if (!confirm('Excluir esta foto? Esta ação não pode ser desfeita.')) return;
                  await excluirFoto(foto.id);
                  toast('Foto excluída.');
                  visor.remove();
                  aoExcluir();
                },
              },
              'Excluir'
            )
          : null,
        el('button', { class: 'btn btn-secundario', onclick: () => visor.remove() }, 'Fechar')
      )
    );
    document.body.append(visor);
  }

  function montarSecaoFotos(categoria) {
    const grade = el('div', { class: 'grade-fotos' });
    const botao = el('button', { class: 'btn btn-secundario' }, '+ Adicionar foto');

    function atualizarBotao() {
      botao.disabled = somenteLeitura || grade.children.length >= categoria.limite;
    }

    function adicionarMiniatura(foto) {
      const url = URL.createObjectURL(foto.blob);
      urlsCriadas.push(url);
      const miniatura = el('img', {
        src: url,
        alt: categoria.rotulo,
        onclick: () =>
          abrirVisor(foto, url, () => {
            miniatura.remove();
            atualizarBotao();
          }),
      });
      grade.append(miniatura);
      atualizarBotao();
    }

    fotos.filter((foto) => foto.categoria === categoria.id).forEach(adicionarMiniatura);
    atualizarBotao();

    const seletor = el('input', {
      type: 'file',
      accept: 'image/*',
      capture: 'environment',
      multiple: categoria.limite > 1,
      style: 'display:none',
      onchange: async (evento) => {
        const vagas = categoria.limite - grade.children.length;
        const arquivos = [...evento.target.files].slice(0, vagas);
        evento.target.value = '';
        for (const arquivo of arquivos) {
          const blob = await comprimirFoto(arquivo);
          const fotoId = await adicionarFoto(inspecaoId, equipamentoId, categoria.id, blob);
          adicionarMiniatura({ id: fotoId, blob });
        }
        if (arquivos.length > 0) toast(arquivos.length > 1 ? 'Fotos adicionadas.' : 'Foto adicionada.');
      },
    });
    botao.addEventListener('click', () => seletor.click());

    const complemento = categoria.obrigatoria
      ? ' (obrigatória)'
      : categoria.limite > 1
        ? ` (opcional, até ${categoria.limite} fotos)`
        : ' (opcional)';

    return el(
      'section',
      { class: 'secao-registro' },
      el('h2', {}, `${categoria.numero} · ${categoria.rotulo}${complemento}`),
      grade,
      seletor,
      !somenteLeitura ? botao : null
    );
  }

  /* ---------- Áudios ---------- */

  const listaAudios = el('div', { class: 'lista' });

  function montarItemAudio(audio) {
    const url = URL.createObjectURL(audio.blob);
    urlsCriadas.push(url);
    const item = el(
      'div',
      { class: 'item-audio' },
      el(
        'div',
        { class: 'detalhe' },
        `Gravado em ${formatarDataHora(audio.criadaEm)}`,
        !somenteLeitura
          ? el(
              'button',
              {
                class: 'btn btn-discreto',
                style: 'width:auto',
                onclick: async () => {
                  if (!confirm('Excluir este áudio? Esta ação não pode ser desfeita.')) return;
                  await excluirAudio(audio.id);
                  item.remove();
                  toast('Áudio excluído.');
                },
              },
              'Excluir'
            )
          : null
      ),
      el('audio', { controls: true, src: url })
    );
    return item;
  }

  audios.forEach((audio) => listaAudios.append(montarItemAudio(audio)));

  let gravador = null;
  const botaoGravar = el('button', { class: 'btn btn-secundario' }, 'Gravar áudio');

  botaoGravar.addEventListener('click', async () => {
    if (gravador) {
      gravador.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast('Gravação de áudio indisponível neste navegador.');
      return;
    }
    try {
      const fluxo = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pedacos = [];
      gravador = new MediaRecorder(fluxo);
      gravador.addEventListener('dataavailable', (evento) => pedacos.push(evento.data));
      gravador.addEventListener('stop', async () => {
        fluxo.getTracks().forEach((faixa) => faixa.stop());
        const blob = new Blob(pedacos, { type: gravador.mimeType || 'audio/webm' });
        gravador = null;
        botaoGravar.textContent = 'Gravar áudio';
        botaoGravar.classList.replace('btn-perigo', 'btn-secundario');
        const audioId = await adicionarAudio(inspecaoId, equipamentoId, blob);
        listaAudios.append(montarItemAudio({ id: audioId, blob, criadaEm: Date.now() }));
        toast('Áudio gravado.');
      });
      gravador.start();
      botaoGravar.textContent = '■ Parar gravação';
      botaoGravar.classList.replace('btn-secundario', 'btn-perigo');
      toast('Gravando…');
    } catch {
      toast('Não foi possível acessar o microfone.');
    }
  });

  // Interrompe a gravação se o usuário sair da tela no meio dela.
  window.addEventListener('hashchange', () => gravador?.stop(), { once: true });

  /* ---------- Observação ---------- */

  const salvarObservacao = debounce(async (valor) => {
    await atualizarRegistro(registro.id, { observacao: valor });
    toast('Salvo.');
  }, 600);

  const campoObservacao = el(
    'textarea',
    {
      placeholder: 'Escreva a observação…',
      disabled: somenteLeitura,
      oninput: (evento) => salvarObservacao(evento.target.value),
    },
    registro.observacao || ''
  );

  /* ---------- Remover da inspeção ---------- */

  async function removerDaInspecao() {
    if (
      !confirm(
        'Remover esta máquina/equipamento da inspeção? As fotos, áudios e observação dela nesta inspeção serão apagados.'
      )
    )
      return;
    await removerEquipamentoDaInspecao(inspecaoId, equipamentoId);
    toast('Máquina/equipamento removida da inspeção.');
    location.hash = `#/inspecao/${inspecaoId}`;
  }

  return [
    cabecalho(equipamento.nome, {
      voltar: `#/inspecao/${inspecaoId}`,
      subtitulo: equipamento.setor || 'Registro da medição',
    }),
    el(
      'main',
      { class: 'conteudo' },
      CATEGORIAS_FOTO.map(montarSecaoFotos),
      el('section', { class: 'secao-registro' }, el('h2', {}, '05 · Gravar áudio (opcional)'), listaAudios, !somenteLeitura ? botaoGravar : null),
      el('section', { class: 'secao-registro' }, el('h2', {}, '06 · Escrever observação (opcional)'), campoObservacao),
      !somenteLeitura
        ? el(
            'button',
            { class: 'btn btn-discreto', onclick: removerDaInspecao },
            'Remover máquina/equipamento desta inspeção'
          )
        : null
    ),
  ];
}
