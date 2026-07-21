// Exportação da inspeção: pacote .zip com relatório HTML, dados JSON, fotos e áudios.

import { el, cabecalho, toast, formatarDataHora } from '../ui.js';
import { VERSAO_APP } from '../versao.js';
import {
  obterInspecao,
  obterCliente,
  equipamentosDaInspecao,
  obterRegistro,
  listarFotos,
  listarAudios,
  CATEGORIAS_FOTO,
} from '../db.js';

function escapar(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

// Monta o relatório HTML autocontido (abre em qualquer navegador, imprime em A4).
function gerarRelatorioHtml({ inspecao, cliente, blocos }) {
  const secoes = blocos
    .map(({ equipamento, registro, fotosPorCategoria, nomesAudios }) => {
      const grupos = CATEGORIAS_FOTO.map((categoria) => {
        const nomes = fotosPorCategoria[categoria.id] || [];
        if (nomes.length === 0) {
          return categoria.obrigatoria
            ? `<p class="pendente">${categoria.numero} · ${escapar(categoria.rotulo)}: <strong>sem foto (obrigatória)</strong></p>`
            : '';
        }
        return `<h3>${categoria.numero} · ${escapar(categoria.rotulo)}</h3>
          <div class="fotos">${nomes.map((nome) => `<img src="fotos/${nome}" alt="Foto">`).join('')}</div>`;
      }).join('');

      const audiosHtml = nomesAudios.length
        ? `<h3>05 · Áudios</h3><ul>${nomesAudios
            .map((nome) => `<li><a href="audios/${nome}">${nome}</a></li>`)
            .join('')}</ul>`
        : '';

      const observacaoHtml = registro?.observacao
        ? `<h3>06 · Observação</h3><p>${escapar(registro.observacao)}</p>`
        : '';

      return `<section>
        <h2>${escapar(equipamento.nome)}${equipamento.setor ? ` — ${escapar(equipamento.setor)}` : ''}</h2>
        ${grupos}
        ${audiosHtml}
        ${observacaoHtml}
      </section>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Relatório de continuidade de aterramento — ${escapar(cliente?.nome ?? '')}</title>
<style>
  body { font-family: system-ui, sans-serif; color: #2b2f36; max-width: 900px; margin: 0 auto; padding: 24px; }
  header { border-bottom: 3px solid #f08019; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 1.3rem; margin: 0 0 4px; }
  .meta { color: #6b7280; font-size: 0.9rem; }
  h2 { font-size: 1.05rem; border-left: 4px solid #f08019; padding-left: 8px; margin: 28px 0 8px; }
  h3 { font-size: 0.9rem; color: #6b7280; margin: 14px 0 6px; }
  .fotos { display: flex; flex-wrap: wrap; gap: 8px; }
  .fotos img { width: 200px; height: 200px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 8px; }
  .pendente { color: #b3261e; }
  footer { margin-top: 32px; color: #6b7280; font-size: 0.8rem; }
  @media print { .fotos img { width: 150px; height: 150px; } }
</style>
</head>
<body>
<header>
  <h1>Medição de continuidade de aterramento elétrico de máquinas e equipamentos</h1>
  <div class="meta">
    Cliente: <strong>${escapar(cliente?.nome ?? '—')}</strong><br>
    Data da inspeção: ${escapar(formatarDataHora(inspecao.criadaEm))}<br>
    Inspetor: ${escapar(inspecao.inspetor || inspecao.responsavel) || '—'}
  </div>
</header>
${secoes}
${inspecao.observacoes ? `<section><h2>Observações gerais</h2><p>${escapar(inspecao.observacoes)}</p></section>` : ''}
<footer>Gerado pelo aplicativo Continuidade de Aterramento v${escapar(VERSAO_APP)} — Nord Consult Ltda.</footer>
</body>
</html>`;
}

function extensaoDoAudio(blob) {
  if (blob.type.includes('ogg')) return 'ogg';
  if (blob.type.includes('mp4') || blob.type.includes('aac')) return 'm4a';
  return 'webm';
}

export async function telaExportar(inspecaoId) {
  const inspecao = await obterInspecao(inspecaoId);
  if (!inspecao) {
    toast('Inspeção não encontrada.');
    location.hash = '#/inspecoes';
    return [];
  }
  const cliente = await obterCliente(inspecao.clienteId);
  const equipamentos = await equipamentosDaInspecao(inspecaoId);

  async function montarZip() {
    const zip = new JSZip();
    const pastaFotos = zip.folder('fotos');
    const pastaAudios = zip.folder('audios');
    const blocos = [];
    const dados = {
      aplicativo: `Continuidade de Aterramento v${VERSAO_APP}`,
      exportadoEm: new Date().toISOString(),
      cliente: cliente ?? null,
      inspecao,
      equipamentos: [],
    };

    for (const equipamento of equipamentos) {
      const registro = await obterRegistro(inspecaoId, equipamento.id);
      const fotos = await listarFotos(inspecaoId, equipamento.id);
      const audios = await listarAudios(inspecaoId, equipamento.id);

      const fotosPorCategoria = {};
      for (const foto of fotos) {
        const nome = `equipamento-${equipamento.id}-${foto.categoria}-${foto.id}.jpg`;
        pastaFotos.file(nome, foto.blob);
        (fotosPorCategoria[foto.categoria] ??= []).push(nome);
      }

      const nomesAudios = [];
      for (const audio of audios) {
        const nome = `equipamento-${equipamento.id}-audio-${audio.id}.${extensaoDoAudio(audio.blob)}`;
        pastaAudios.file(nome, audio.blob);
        nomesAudios.push(nome);
      }

      blocos.push({ equipamento, registro, fotosPorCategoria, nomesAudios });
      dados.equipamentos.push({
        ...equipamento,
        observacao: registro?.observacao ?? '',
        fotos: fotosPorCategoria,
        audios: nomesAudios,
      });
    }

    zip.file('relatorio.html', gerarRelatorioHtml({ inspecao, cliente, blocos }));
    zip.file('dados.json', JSON.stringify(dados, null, 2));
    return zip.generateAsync({ type: 'blob' });
  }

  function nomeDoArquivo() {
    const data = new Date(inspecao.criadaEm).toISOString().slice(0, 10);
    const nomeCliente = (cliente?.nome ?? 'cliente')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    return `aterramento-${nomeCliente}-${data}.zip`;
  }

  async function baixar() {
    try {
      toast('Gerando pacote…');
      const blob = await montarZip();
      const url = URL.createObjectURL(blob);
      const ancora = el('a', { href: url, download: nomeDoArquivo() });
      document.body.append(ancora);
      ancora.click();
      ancora.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      toast('Pacote gerado.');
    } catch (erro) {
      console.error(erro);
      toast('Erro ao gerar o pacote.');
    }
  }

  async function compartilhar() {
    try {
      toast('Gerando pacote…');
      const blob = await montarZip();
      const arquivo = new File([blob], nomeDoArquivo(), { type: 'application/zip' });
      if (navigator.canShare?.({ files: [arquivo] })) {
        await navigator.share({ files: [arquivo], title: 'Relatório de aterramento' });
      } else {
        toast('Compartilhamento indisponível — baixando o arquivo.');
        await baixar();
      }
    } catch (erro) {
      if (erro?.name !== 'AbortError') {
        console.error(erro);
        toast('Erro ao compartilhar.');
      }
    }
  }

  const totalEquipamentos = equipamentos.length;

  return [
    cabecalho('Exportar relatório', {
      voltar: `#/inspecao/${inspecaoId}`,
      subtitulo: cliente ? cliente.nome : undefined,
    }),
    el(
      'main',
      { class: 'conteudo' },
      el(
        'div',
        { class: 'cartao', style: 'cursor: default' },
        el(
          'div',
          { class: 'principal' },
          el('div', { class: 'titulo' }, 'Conteúdo do pacote (.zip)'),
          el(
            'div',
            { class: 'detalhe' },
            `Relatório em HTML, dados em JSON, fotos e áudios de ${totalEquipamentos} máquina(s)/equipamento(s).`
          )
        )
      ),
      totalEquipamentos === 0
        ? el('div', { class: 'vazio' }, 'A inspeção ainda não tem máquinas/equipamentos.')
        : null,
      el(
        'button',
        { class: 'btn btn-primario btn-grande', onclick: baixar, disabled: totalEquipamentos === 0 },
        'Baixar pacote (.zip)'
      ),
      el(
        'button',
        { class: 'btn btn-secundario', onclick: compartilhar, disabled: totalEquipamentos === 0 },
        'Compartilhar'
      )
    ),
  ];
}
