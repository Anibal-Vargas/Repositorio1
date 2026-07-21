// Exportação da inspeção: pacote .zip com relatório HTML, dados JSON e fotos.

import { el, cabecalho, toast, formatarDataHora } from '../ui.js';
import { VERSAO_APP } from '../versao.js';
import {
  obterInspecao,
  obterCliente,
  equipamentosDaInspecao,
  listarMedicoes,
  listarFotos,
  LIMITE_OHMS,
} from '../db.js';

const ROTULOS = { conforme: 'Conforme', nc: 'Não conforme', na: 'N/A' };

function escapar(texto) {
  return String(texto ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function formatarOhms(valor) {
  if (valor === '' || valor === null || valor === undefined) return '—';
  return `${String(valor).replace('.', ',')} Ω`;
}

// Monta o relatório HTML autocontido (abre em qualquer navegador, imprime em A4).
function gerarRelatorioHtml({ inspecao, cliente, blocos }) {
  const linhasEquipamentos = blocos
    .map(({ equipamento, medicoes, nomesFotos }) => {
      const linhas = medicoes
        .map((medicao) => {
          const classe =
            medicao.resultado === 'nc' ? 'nc' : medicao.resultado === 'conforme' ? 'ok' : '';
          return `<tr>
            <td>${escapar(medicao.descricao)}</td>
            <td>${medicao.temMedicao ? formatarOhms(medicao.valorOhms) : '—'}</td>
            <td class="${classe}">${medicao.resultado ? ROTULOS[medicao.resultado] : 'Sem resposta'}</td>
            <td>${escapar(medicao.observacao) || '—'}</td>
          </tr>`;
        })
        .join('');
      const fotosHtml = nomesFotos.length
        ? `<div class="fotos">${nomesFotos
            .map((nome) => `<img src="fotos/${nome}" alt="Foto">`)
            .join('')}</div>`
        : '';
      return `<section>
        <h2>${escapar(equipamento.nome)}${equipamento.setor ? ` — ${escapar(equipamento.setor)}` : ''}</h2>
        <table>
          <thead><tr><th>Ponto de verificação</th><th>Valor medido</th><th>Resultado</th><th>Observação</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
        ${fotosHtml}
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
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #fdf3e7; }
  td.ok { color: #2e7d32; font-weight: 600; }
  td.nc { color: #b3261e; font-weight: 600; }
  .fotos { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .fotos img { width: 160px; height: 160px; object-fit: cover; border: 1px solid #e5e7eb; border-radius: 8px; }
  footer { margin-top: 32px; color: #6b7280; font-size: 0.8rem; }
  @media print { .fotos img { width: 120px; height: 120px; } }
</style>
</head>
<body>
<header>
  <h1>Medição de continuidade de aterramento elétrico de máquinas e equipamentos</h1>
  <div class="meta">
    Cliente: <strong>${escapar(cliente?.nome ?? '—')}</strong><br>
    Data da inspeção: ${escapar(formatarDataHora(inspecao.criadaEm))}<br>
    Responsável: ${escapar(inspecao.responsavel) || '—'}<br>
    Instrumento: ${escapar(inspecao.instrumento) || '—'}<br>
    Limite referencial de continuidade: ${String(LIMITE_OHMS).replace('.', ',')} Ω
  </div>
</header>
${linhasEquipamentos}
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
    const pastaFotos = zip.folder('fotos');
    const blocos = [];
    const dados = {
      aplicativo: `Continuidade de Aterramento v${VERSAO_APP}`,
      exportadoEm: new Date().toISOString(),
      cliente: cliente ?? null,
      inspecao,
      equipamentos: [],
    };

    for (const equipamento of equipamentos) {
      const medicoes = await listarMedicoes(inspecaoId, equipamento.id);
      const fotos = await listarFotos(inspecaoId, equipamento.id);
      const nomesFotos = [];
      for (const foto of fotos) {
        const nome = `equipamento-${equipamento.id}-foto-${foto.id}.jpg`;
        pastaFotos.file(nome, foto.blob);
        nomesFotos.push(nome);
      }
      blocos.push({ equipamento, medicoes, nomesFotos });
      dados.equipamentos.push({ ...equipamento, medicoes, fotos: nomesFotos });
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
            `Relatório em HTML, dados em JSON e fotos de ${totalEquipamentos} equipamento(s).`
          )
        )
      ),
      totalEquipamentos === 0
        ? el('div', { class: 'vazio' }, 'A inspeção ainda não tem equipamentos.')
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
