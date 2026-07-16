// export.js — Fase 3: gera o pacote ZIP de uma inspeção.
// Estrutura do pacote (padrão de importação Nord Consult):
//   NCs/AA-MM-DD/<Área>/[<Sub-área>/]NC-XXX/
//     NC-XXX_foto01.jpg…  NC-XXX_audio01.webm…  NC-XXX_desc01.txt
// (a data é a do registro de cada NC; "AA-MM-DD" porque "/" não é
// permitido em nome de pasta). Na raiz ficam ainda relatorio.html
// (legível) e dados.json (estruturado).
// JSZip é carregado como script global em index.html.

import { db } from './db.js';

const ROTULO_TIPO = {
  geral: 'Geral',
  subestacoes: 'Subestações',
  paineis: 'Painéis',
  documental: 'Documental',
};

// ---------- utilitários ----------

function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sanitizarNomeArquivo(nome) {
  const limpo = String(nome)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .trim().replace(/\s+/g, '_')
    .slice(0, 40);
  return limpo || 'inspecao';
}

/** Nome de pasta seguro (Windows/Android), preservando acentos e espaços. */
function sanitizarPasta(nome) {
  const limpo = String(nome)
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 60);
  return limpo || 'Sem nome';
}

/** Data da NC como pasta AA-MM-DD (ano-mês-dia, hora local). */
function dataPasta(ts) {
  const d = new Date(ts);
  const AA = String(d.getFullYear() % 100).padStart(2, '0');
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  return `${AA}-${MM}-${DD}`;
}

function extensaoAudio(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

function dataCurta(ts) {
  return new Date(ts).toLocaleDateString('pt-BR');
}

function dataHora(ts) {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ---------- coleta ----------

/**
 * Reúne tudo de uma inspeção numa árvore: áreas raiz → sub-áreas → NCs,
 * com os nomes de arquivo que fotos e áudios terão dentro do ZIP.
 */
export async function coletarDados(inspecaoId) {
  const inspecao = await db.inspecoes.get(inspecaoId);
  if (!inspecao) throw new Error('Inspeção não encontrada.');
  const cliente = await db.clientes.get(inspecao.clienteId);
  const areas = await db.areas.where('inspecaoId').equals(inspecaoId).sortBy('criadoEm');
  const ncs = await db.ncs.where('inspecaoId').equals(inspecaoId).sortBy('criadoEm');

  const totais = { areas: areas.length, ncs: ncs.length, fotos: 0, audios: 0 };

  // caminhoArea: "Área" ou "Área/Sub-área" (já saneado para nome de pasta).
  async function montarNC(nc, caminhoArea) {
    const fotos = await db.fotos.where('ncId').equals(nc.id).sortBy('criadoEm');
    const audios = await db.audios.where('ncId').equals(nc.id).sortBy('criadoEm');
    totais.fotos += fotos.length;
    totais.audios += audios.length;
    const pasta = `NCs/${dataPasta(nc.criadoEm)}/${caminhoArea}/${nc.numero}`;
    return {
      numero: nc.numero,
      descricao: nc.descricao || '',
      criadoEm: nc.criadoEm,
      pasta,
      descricaoArquivo: nc.descricao
        ? `${pasta}/${nc.numero}_desc01.txt`
        : null,
      fotos: fotos.map((foto, i) => ({
        arquivo: `${pasta}/${nc.numero}_foto${String(i + 1).padStart(2, '0')}.jpg`,
        blob: foto.blob,
      })),
      audios: audios.map((audio, i) => ({
        arquivo: `${pasta}/${nc.numero}_audio${String(i + 1).padStart(2, '0')}.${extensaoAudio(audio.mime)}`,
        mime: audio.mime || 'audio/webm',
        blob: audio.blob,
      })),
    };
  }

  const ncsDaArea = async (areaId, caminhoArea) =>
    Promise.all(ncs.filter((nc) => nc.areaId === areaId).map((nc) => montarNC(nc, caminhoArea)));

  const arvore = [];
  for (const area of areas.filter((a) => (a.parentId ?? null) === null)) {
    const pastaArea = sanitizarPasta(area.nome);
    const subareas = [];
    for (const sub of areas.filter((a) => a.parentId === area.id)) {
      subareas.push({
        nome: sub.nome,
        ncs: await ncsDaArea(sub.id, `${pastaArea}/${sanitizarPasta(sub.nome)}`),
      });
    }
    arvore.push({ nome: area.nome, ncs: await ncsDaArea(area.id, pastaArea), subareas });
  }

  return { inspecao, cliente, arvore, totais };
}

// ---------- relatório HTML ----------

function cartaoNC(nc) {
  // encodeURI: os caminhos têm espaços/acentos (nomes de área).
  const fotos = nc.fotos.length
    ? `<div class="fotos">${nc.fotos.map((f) =>
        `<a href="${encodeURI(f.arquivo)}"><img src="${encodeURI(f.arquivo)}" loading="lazy" alt="Foto da ${escapar(nc.numero)}"></a>`
      ).join('')}</div>`
    : '';
  const audios = nc.audios.length
    ? `<ul class="audios">${nc.audios.map((a) =>
        `<li>🎙️ <a href="${encodeURI(a.arquivo)}">${a.arquivo.split('/').pop()}</a></li>`
      ).join('')}</ul>`
    : '';
  return `<article class="nc">
    <header><span class="selo">${escapar(nc.numero)}</span>
    <span class="quando">${escapar(dataHora(nc.criadoEm))}</span></header>
    <p class="descricao">${nc.descricao ? escapar(nc.descricao) : '<em>Sem descrição.</em>'}</p>
    ${fotos}${audios}
  </article>`;
}

function gerarRelatorioHTML(dados) {
  const { inspecao, cliente, arvore, totais } = dados;
  const titulo = `Inspeção ${ROTULO_TIPO[inspecao.tipo] || inspecao.tipo} — ${cliente ? cliente.nome : 'Cliente'}`;

  const secoes = arvore.map((area) => `
    <section>
      <h2>📍 ${escapar(area.nome)}</h2>
      ${area.ncs.map(cartaoNC).join('') || (area.subareas.length ? '' : '<p class="vazio">Nenhuma NC nesta área.</p>')}
      ${area.subareas.map((sub) => `
        <h3>📍 ${escapar(area.nome)} › ${escapar(sub.nome)}</h3>
        ${sub.ncs.map(cartaoNC).join('') || '<p class="vazio">Nenhuma NC nesta sub-área.</p>'}
      `).join('')}
    </section>
  `).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapar(titulo)}</title>
<style>
  :root { --laranja: #f08019; --laranja-forte: #c25e00; --grafite: #2b2f36; --cinza: #6b7280; --borda: #e5e7eb; --vermelho: #b3261e; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; color: var(--grafite); margin: 0 auto; max-width: 900px; padding: 1.5rem 1rem 3rem; line-height: 1.5; }
  header.topo { border-bottom: 4px solid var(--laranja); padding-bottom: 1rem; margin-bottom: 1.5rem; }
  header.topo h1 { margin: 0 0 0.25rem; font-size: 1.5rem; }
  .meta { color: var(--cinza); font-size: 0.95rem; }
  .meta strong { color: var(--grafite); }
  .totais { display: flex; gap: 1.5rem; flex-wrap: wrap; margin-top: 0.75rem; font-size: 0.95rem; }
  h2 { color: var(--laranja-forte); border-bottom: 1px solid var(--borda); padding-bottom: 0.25rem; margin: 2rem 0 0.75rem; }
  h3 { color: var(--cinza); margin: 1.25rem 0 0.5rem; }
  .nc { border: 1px solid var(--borda); border-left: 5px solid var(--vermelho); border-radius: 8px; padding: 0.75rem 1rem; margin: 0.75rem 0; page-break-inside: avoid; }
  .nc header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
  .selo { background: var(--vermelho); color: #fff; border-radius: 999px; padding: 0.1rem 0.7rem; font-weight: 700; font-size: 0.9rem; }
  .quando { color: var(--cinza); font-size: 0.85rem; }
  .descricao { margin: 0.5rem 0; white-space: pre-wrap; }
  .fotos { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 0.5rem; margin: 0.5rem 0; }
  .fotos img { width: 100%; height: 150px; object-fit: cover; border-radius: 6px; border: 1px solid var(--borda); }
  .audios { margin: 0.5rem 0 0; padding-left: 1rem; font-size: 0.9rem; }
  .vazio { color: var(--cinza); font-style: italic; }
  footer { margin-top: 2.5rem; color: var(--cinza); font-size: 0.85rem; border-top: 1px solid var(--borda); padding-top: 0.75rem; }
  @media print { .fotos img { height: 120px; } }
</style>
</head>
<body>
<header class="topo">
  <h1>${escapar(titulo)}</h1>
  <div class="meta">
    <div><strong>Cliente:</strong> ${escapar(cliente ? cliente.nome : '—')}</div>
    <div><strong>Inspetor:</strong> ${escapar(inspecao.inspetorNome || '—')} · Nord Consult</div>
    <div><strong>Início:</strong> ${escapar(dataHora(inspecao.criadoEm))} ·
         <strong>Última atividade:</strong> ${escapar(dataHora(inspecao.atualizadoEm))}</div>
    <div><strong>Situação:</strong> ${inspecao.status === 'finalizada' ? 'Finalizada' : 'Em andamento'}</div>
  </div>
  <div class="totais">
    <span>📍 <strong>${totais.areas}</strong> área(s)</span>
    <span>⚠️ <strong>${totais.ncs}</strong> NC(s)</span>
    <span>📷 <strong>${totais.fotos}</strong> foto(s)</span>
    <span>🎙️ <strong>${totais.audios}</strong> áudio(s)</span>
  </div>
</header>
${secoes || '<p class="vazio">Nenhuma área registrada.</p>'}
<footer>Relatório gerado pelo app Inspeções de conformidade Técnica/NR-10 – Nord Consult em ${escapar(dataHora(Date.now()))}. Fotos, áudios e descrições estão na pasta <code>NCs/</code> deste pacote (data → área → sub-área → NC).</footer>
</body>
</html>`;
}

// ---------- dados.json ----------

function gerarJSON(dados) {
  const { inspecao, cliente, arvore, totais } = dados;
  const limparNC = (nc) => ({
    numero: nc.numero,
    descricao: nc.descricao,
    criadoEm: new Date(nc.criadoEm).toISOString(),
    pasta: nc.pasta,
    descricaoArquivo: nc.descricaoArquivo,
    fotos: nc.fotos.map((f) => f.arquivo),
    audios: nc.audios.map((a) => a.arquivo),
  });
  return JSON.stringify({
    app: 'Inspeções de conformidade Técnica/NR-10 – Nord Consult',
    exportadoEm: new Date().toISOString(),
    inspecao: {
      tipo: inspecao.tipo,
      rotuloTipo: ROTULO_TIPO[inspecao.tipo] || inspecao.tipo,
      status: inspecao.status,
      inspetor: inspecao.inspetorNome || '',
      criadoEm: new Date(inspecao.criadoEm).toISOString(),
      atualizadoEm: new Date(inspecao.atualizadoEm).toISOString(),
    },
    cliente: { nome: cliente ? cliente.nome : '' },
    totais,
    areas: arvore.map((area) => ({
      nome: area.nome,
      ncs: area.ncs.map(limparNC),
      subareas: area.subareas.map((sub) => ({
        nome: sub.nome,
        ncs: sub.ncs.map(limparNC),
      })),
    })),
  }, null, 2);
}

// ---------- pacote ZIP ----------

/**
 * Gera o ZIP da inspeção. aoProgredir(percentual 0–100) é opcional.
 * Retorna { blob, nomeArquivo, dados }.
 */
export async function gerarZip(inspecaoId, aoProgredir) {
  const dados = await coletarDados(inspecaoId);
  const zip = new JSZip();

  zip.file('relatorio.html', gerarRelatorioHTML(dados));
  zip.file('dados.json', gerarJSON(dados));

  // Fotos (JPEG) e áudios já são comprimidos: STORE evita trabalho inútil.
  for (const area of dados.arvore) {
    const todasNCs = [...area.ncs, ...area.subareas.flatMap((s) => s.ncs)];
    for (const nc of todasNCs) {
      for (const foto of nc.fotos) zip.file(foto.arquivo, foto.blob, { compression: 'STORE' });
      for (const audio of nc.audios) zip.file(audio.arquivo, audio.blob, { compression: 'STORE' });
      if (nc.descricaoArquivo) zip.file(nc.descricaoArquivo, nc.descricao);
      // NC sem nenhum anexo: registra a pasta vazia mesmo assim.
      if (!nc.fotos.length && !nc.audios.length && !nc.descricaoArquivo) zip.folder(nc.pasta);
    }
  }

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (meta) => { if (aoProgredir) aoProgredir(meta.percent); },
  );

  const nomeArquivo = `Inspecao_NR10_${sanitizarNomeArquivo(dados.cliente ? dados.cliente.nome : 'cliente')}_${new Date(dados.inspecao.criadoEm).toISOString().slice(0, 10)}.zip`;
  return { blob, nomeArquivo, dados };
}
