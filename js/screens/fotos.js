// Fotos de um equipamento na inspeção: grade de miniaturas + visor em tela cheia.

import { el, cabecalho, toast } from '../ui.js';
import {
  obterInspecao,
  obterEquipamento,
  listarFotos,
  adicionarFoto,
  excluirFoto,
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

export async function telaFotos(inspecaoId, equipamentoId) {
  const inspecao = await obterInspecao(inspecaoId);
  const equipamento = await obterEquipamento(equipamentoId);
  if (!inspecao || !equipamento) {
    toast('Equipamento não encontrado nesta inspeção.');
    location.hash = `#/inspecao/${inspecaoId}`;
    return [];
  }
  const somenteLeitura = inspecao.status === 'finalizada';

  const grade = el('div', { class: 'grade-fotos' });
  const vazio = el('div', { class: 'vazio' }, 'Nenhuma foto ainda.');
  const urlsCriadas = [];

  function abrirVisor(foto, url) {
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
                  document.getElementById(`foto-${foto.id}`)?.remove();
                  atualizarVazio();
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

  function adicionarMiniatura(foto) {
    const url = URL.createObjectURL(foto.blob);
    urlsCriadas.push(url);
    grade.append(
      el('img', {
        id: `foto-${foto.id}`,
        src: url,
        alt: 'Foto do equipamento',
        onclick: () => abrirVisor(foto, url),
      })
    );
  }

  function atualizarVazio() {
    vazio.style.display = grade.children.length === 0 ? '' : 'none';
  }

  const fotos = await listarFotos(inspecaoId, equipamentoId);
  fotos.forEach(adicionarMiniatura);
  atualizarVazio();

  // Libera as URLs de objeto ao sair da tela.
  window.addEventListener(
    'hashchange',
    () => urlsCriadas.forEach((url) => URL.revokeObjectURL(url)),
    { once: true }
  );

  const seletorArquivo = el('input', {
    type: 'file',
    accept: 'image/*',
    capture: 'environment',
    multiple: true,
    style: 'display:none',
    onchange: async (evento) => {
      const arquivos = [...evento.target.files];
      evento.target.value = '';
      for (const arquivo of arquivos) {
        const blob = await comprimirFoto(arquivo);
        const fotoId = await adicionarFoto(inspecaoId, equipamentoId, blob);
        adicionarMiniatura({ id: fotoId, blob });
      }
      atualizarVazio();
      toast(arquivos.length > 1 ? 'Fotos adicionadas.' : 'Foto adicionada.');
    },
  });

  return [
    cabecalho('Fotos', {
      voltar: `#/inspecao/${inspecaoId}/equipamento/${equipamentoId}`,
      subtitulo: equipamento.nome,
    }),
    el(
      'main',
      { class: 'conteudo' },
      grade,
      vazio,
      seletorArquivo,
      !somenteLeitura
        ? el(
            'button',
            { class: 'btn btn-primario', onclick: () => seletorArquivo.click() },
            '+ Adicionar foto'
          )
        : null
    ),
  ];
}
