// Exportação da inspeção: pacote .zip com relatório HTML, dados JSON e a
// estrutura Fotos/<máquina>/ com arquivos de nomes fixos:
// 01 (máquina), 02 (valor medido), 03 (prancheta), 04 a 14 (adicionais),
// "áudio" e "observação".

import { el, cabecalho, toast, formatarDataHora } from '../ui.js';
import { VERSAO_APP } from '../versao.js';
import {
  obterInspecao,
  obterCliente,
  obterSetor,
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

// Remove caracteres inválidos em nomes de pasta/arquivo, preservando o resto.
function nomeSeguro(texto) {
  return texto.replace(/[\\/:*?"<>|]/g, '-').trim();
}

function rotuloResultado(resultado) {
  if (resultado === 'conforme') return 'Conforme';
  if (resultado === 'nc') return 'Não conforme';
  return null;
}

function extensaoDoAudio(blob) {
  if (blob.type.includes('ogg')) return 'ogg';
  if (blob.type.includes('mp4') || blob.type.includes('aac')) return 'm4a';
  return 'webm';
}

// Caminho relativo codificado para uso em src/href do relatório.
function caminhoUrl(...segmentos) {
  return segmentos.map(encodeURIComponent).join('/');
}

// Monta o relatório HTML autocontido (abre em qualquer navegador, imprime em A4).
function gerarRelatorioHtml({ inspecao, cliente, blocos }) {
  const secoes = blocos
    .map(({ equipamento, nomeSetor, registro, pasta, arquivosFotos, arquivosAudios }) => {
      const resultado = rotuloResultado(registro?.resultado);
      const resultadoHtml = resultado
        ? `<p class="resultado ${registro.resultado === 'nc' ? 'nc' : 'ok'}">Resultado da medição: <strong>${resultado}</strong></p>`
        : '';

      const grupos = CATEGORIAS_FOTO.map((categoria) => {
        const nomes = arquivosFotos[categoria.id] || [];
        let bloco;
        if (nomes.length === 0) {
          bloco = categoria.obrigatoria
            ? `<p class="pendente">${categoria.numero} · ${escapar(categoria.rotulo)}: <strong>sem foto (obrigatória)</strong></p>`
            : '';
        } else {
          bloco = `<h3>${categoria.numero} · ${escapar(categoria.rotulo)}</h3>
          <div class="fotos">${nomes
            .map((nome) => `<img src="${caminhoUrl('Fotos', pasta, nome)}" alt="Foto">`)
            .join('')}</div>`;
        }
        // O resultado da medição aparece logo após a foto do valor medido (02).
        if (categoria.id === 'valor') bloco += resultadoHtml;
        return bloco;
      }).join('');

      const audiosHtml = arquivosAudios.length
        ? `<h3>05 · Áudios</h3><ul>${arquivosAudios
            .map((nome) => `<li><a href="${caminhoUrl('Fotos', pasta, nome)}">${escapar(nome)}</a></li>`)
            .join('')}</ul>`
        : '';

      const observacaoHtml = registro?.observacao
        ? `<h3>06 · Observação</h3><p>${escapar(registro.observacao)}</p>`
        : '';

      return `<section>
        <h2>${escapar(equipamento.nome)}${nomeSetor ? ` — Setor: ${escapar(nomeSetor)}` : ''}</h2>
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
  .resultado { font-size: 0.95rem; margin: 10px 0; }
  .resultado.ok { color: #2e7d32; }
  .resultado.nc { color: #b3261e; }
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
    const pastaFotos = zip.folder('Fotos');
    const pastasUsadas = new Set();
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
      const setor = await obterSetor(equipamento.setorId);
      const fotos = await listarFotos(inspecaoId, equipamento.id);
      const audios = await listarAudios(inspecaoId, equipamento.id);

      // Pasta com o nome da máquina/equipamento como foi salvo no aplicativo.
      let pasta = nomeSeguro(equipamento.nome) || `equipamento-${equipamento.id}`;
      let sufixo = 2;
      while (pastasUsadas.has(pasta.toLowerCase())) {
        pasta = `${nomeSeguro(equipamento.nome)} (${sufixo})`;
        sufixo += 1;
      }
      pastasUsadas.add(pasta.toLowerCase());
      const pastaEquipamento = pastaFotos.folder(pasta);

      // Fotos com nomes fixos: 01, 02, 03 e 04 a 14 (adicionais).
      const arquivosFotos = {};
      const unicas = { maquina: '01', valor: '02', prancheta: '03' };
      let proximoAdicional = 4;
      for (const foto of fotos.sort((a, b) => a.criadaEm - b.criadaEm)) {
        let nome;
        if (unicas[foto.categoria]) {
          nome = `${unicas[foto.categoria]}.jpg`;
          delete unicas[foto.categoria]; // limite de 1 por categoria
        } else {
          nome = `${String(proximoAdicional).padStart(2, '0')}.jpg`;
          proximoAdicional += 1;
        }
        pastaEquipamento.file(nome, foto.blob);
        (arquivosFotos[foto.categoria] ??= []).push(nome);
      }

      // Áudios: "áudio", "áudio-2", …
      const arquivosAudios = [];
      audios.sort((a, b) => a.criadaEm - b.criadaEm).forEach((audio, indice) => {
        const nome = `áudio${indice > 0 ? `-${indice + 1}` : ''}.${extensaoDoAudio(audio.blob)}`;
        pastaEquipamento.file(nome, audio.blob);
        arquivosAudios.push(nome);
      });

      // Observação: "observação.txt".
      if (registro?.observacao) {
        pastaEquipamento.file('observação.txt', registro.observacao);
      }

      const nomeSetor = setor?.nome ?? '';
      blocos.push({ equipamento, nomeSetor, registro, pasta, arquivosFotos, arquivosAudios });
      dados.equipamentos.push({
        ...equipamento,
        setor: nomeSetor,
        pasta: `Fotos/${pasta}`,
        resultadoMedicao: rotuloResultado(registro?.resultado),
        observacao: registro?.observacao ?? '',
        fotos: arquivosFotos,
        audios: arquivosAudios,
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
            `Relatório em HTML, dados em JSON e a pasta "Fotos" com uma subpasta por ` +
              `máquina/equipamento (${totalEquipamentos} no total), contendo as fotos ` +
              `numeradas, os áudios e a observação.`
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
