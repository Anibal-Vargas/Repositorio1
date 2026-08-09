/* =============================================================================
   planilha.js — preenche a planilha modelo a partir do dados.json do app de campo.

   ESTRATÉGIA: manipulação direta do XML dentro do .xlsx (que é um ZIP).
   Nada de biblioteca de planilha. Motivo: o modelo usa formatação condicional da
   extensão x14 (<extLst>) para colorir as respostas, e tanto o ExcelJS quanto o
   openpyxl DESCARTAM esse bloco ao salvar — sem erro, sem aviso. Editando o XML
   só nas células que precisam mudar, tudo o mais permanece byte a byte idêntico:
   fórmulas, estilos, formatação condicional, validação, imagens.
   ========================================================================== */

const ABA_RESULTADO = 'xl/worksheets/sheet1.xml';
const ABA_RANKING = 'xl/worksheets/sheet2.xml';
const LOGO_CLIENTE = 'xl/media/image3.jpeg';

const LINHA_INICIAL = 6;
const ULTIMA_LINHA = 348;          // capacidade do modelo: 343 painéis
const ALTURA_PADRAO = 54;          // pontos
const ALTURA_LINHA_TEXTO = 13.5;
const CHARS_POR_LINHA = 72;        // cabem ~72 caracteres na largura da coluna U

// Glifos da fonte Wingdings 2 — a legenda do modelo vive em W2/W3/W4.
// ATENÇÃO: escrever "Sim"/"Não" como texto não gera erro, mas as fórmulas do
// Ranking comparam contra $W$3/$W$4 e nunca casariam: tudo pontuaria 100%.
const GLIFO = { conforme: '<', nao_conforme: '=', nao_aplica: '\u0098' };

// Coluna do modelo -> id do item no checklist do app de campo
const COLUNAS = [
  ['F', 'pan-001'], ['G', 'pan-002'], ['H', 'pan-003'], ['I', 'pan-004'],
  ['J', 'pan-005'], ['K', 'pan-006'], ['L', 'pan-007'], ['M', 'pan-008'],
  ['N', 'pan-009'], ['O', 'pan-010'], ['P', 'pan-014'], ['Q', 'pan-011'],
  ['R', 'pan-012'], ['S', 'pan-013'],
];
const MAPEADOS = new Set(COLUNAS.map(c => c[1]));
// Fora do escopo da planilha por decisão (iluminação da sala, ergonomia)
const IGNORADOS = new Set(['pan-015', 'pan-016']);

const COL_ITEM = 'B', COL_PAINEL = 'C', COL_AREA = 'D', COL_SUBAREA = 'E';
const COL_RANKING = 'T', COL_OUTRAS = 'U';
const COLS_RESULTADO = 'BCDEFGHIJKLMNOPQRSTU'.split('');

/* ------------------------------------------------------------------ utils */
const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const letraParaNum = L => [...L].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);

function estiloDe(attrs) {
  const m = /\ss="(\d+)"/.exec(attrs || '');
  return m ? ` s="${m[1]}"` : '';
}

/** Aplica edições de célula dentro do XML de UMA linha (string curta e barata). */
function editarLinha(xmlLinha, valores) {
  return xmlLinha.replace(
    /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g,
    (todo, col, lin, attrs) => {
      if (!(col in valores)) return todo;
      const s = estiloDe(attrs);
      const v = valores[col];
      if (v === null || v === undefined || v === '') return `<c r="${col}${lin}"${s}/>`;
      return `<c r="${col}${lin}"${s} t="inlineStr">` +
             `<is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    });
}

/** Esvazia as células de um intervalo de colunas, preservando o estilo. */
function limparLinha(xmlLinha, primeira, ultima) {
  const a = letraParaNum(primeira), b = letraParaNum(ultima);
  return xmlLinha.replace(
    /<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g,
    (todo, col, lin, attrs) => {
      const n = letraParaNum(col);
      if (n < a || n > b) return todo;
      return `<c r="${col}${lin}"${estiloDe(attrs)}/>`;
    });
}

function definirAltura(aberturaLinha, altura) {
  let tag = aberturaLinha;
  tag = /\sht="[\d.]+"/.test(tag)
    ? tag.replace(/\sht="[\d.]+"/, ` ht="${altura}"`)
    : tag.replace(/^<row/, `<row ht="${altura}"`);
  if (!/customHeight="1"/.test(tag)) tag = tag.replace(/>$/, ' customHeight="1">');
  return tag;
}

/** Indexa as linhas do sheetData uma única vez (evita varrer 1 MB por célula). */
function indexarLinhas(xml) {
  const idx = new Map();
  const re = /<row r="(\d+)"[^>]*>[\s\S]*?<\/row>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    idx.set(Number(m[1]), { inicio: m.index, fim: m.index + m[0].length, texto: m[0] });
  }
  return idx;
}

function aplicar(xml, idx, edicoes) {
  const alvos = [...edicoes.keys()].sort((a, b) => b - a); // de trás pra frente
  for (const lin of alvos) {
    const r = idx.get(lin);
    if (!r) continue;
    xml = xml.slice(0, r.inicio) + edicoes.get(lin) + xml.slice(r.fim);
  }
  return xml;
}

/* ------------------------------------------- pacotes divididos em partes */

/* O dados.json NÃO informa a parte — a informação existe só no nome da pasta
   e, em prosa, no LEIA-ME.txt. Enquanto o app de campo não expuser um campo
   estruturado (`parte: {numero, de}`), a detecção é por texto. */
function detectarParte(nomeArquivo, nomePasta, leiame) {
  const rx = /parte\s*(\d+)\s*de\s*(\d+)/i;
  for (const origem of [nomePasta || '', nomeArquivo || '', leiame || '']) {
    const m = rx.exec(String(origem).replace(/_/g, ' '));
    if (m) return { numero: Number(m[1]), total: Number(m[2]) };
  }
  return { numero: 1, total: 1 };
}

/** Junta as partes numa única estrutura equivalente a uma exportação inteira. */
function mesclarPartes(partes) {
  const ordenadas = [...partes].sort((a, b) => a.parte.numero - b.parte.numero);
  const conflitos = [];

  const base = JSON.parse(JSON.stringify(ordenadas[0].dados));
  base.checklist = base.checklist || [];
  base.areas = base.areas || [];
  const vistasSecao = new Set(base.checklist.map(s => s.secao));
  const areasPorNome = new Map(base.areas.map(a => [a.nome, a]));

  for (const p of ordenadas.slice(1)) {
    const d = p.dados;

    // Garante que as partes são da MESMA inspeção
    const mesmoCliente = (d.cliente?.nome || '') === (base.cliente?.nome || '');
    const mesmaData = (d.inspecao?.criadoEm || '') === (base.inspecao?.criadoEm || '');
    if (!mesmoCliente || !mesmaData) {
      conflitos.push(`A parte ${p.parte.numero} parece ser de outra inspeção ` +
        `(${d.cliente?.nome || 'cliente?'} / ${(d.inspecao?.criadoEm || '').slice(0, 10)}).`);
      continue;
    }

    for (const secao of (d.checklist || [])) {
      if (vistasSecao.has(secao.secao)) {
        conflitos.push(`O painel "${secao.secao.split('—')[0].trim()}" aparece em ` +
          `mais de uma parte. Mantida a primeira ocorrência.`);
        continue;
      }
      vistasSecao.add(secao.secao);
      base.checklist.push(secao);
    }

    for (const area of (d.areas || [])) {
      const existente = areasPorNome.get(area.nome);
      if (existente) {
        existente.ncs = (existente.ncs || []).concat(area.ncs || []);
      } else {
        areasPorNome.set(area.nome, area);
        base.areas.push(area);
      }
    }

    for (const chave of ['ncs', 'fotos', 'audios', 'areas']) {
      if (d.totais && typeof d.totais[chave] === 'number') {
        base.totais = base.totais || {};
        base.totais[chave] = (base.totais[chave] || 0) + d.totais[chave];
      }
    }
  }
  return { dados: base, conflitos };
}

/* ------------------------------------------------- leitura do dados.json */
function interpretarDados(dados) {
  const paineis = [];
  const extras = new Map();

  for (const secao of dados.checklist || []) {
    const corte = secao.secao.lastIndexOf('—');
    const base = (corte >= 0 ? secao.secao.slice(0, corte) : secao.secao).trim();
    const sufixo = corte >= 0 ? secao.secao.slice(corte + 1).trim() : '';
    const partes = base.split('›').map(p => p.trim()).filter(Boolean);

    if (sufixo !== 'Verificações do painel') {
      const lista = extras.get(base) || [];
      lista.push(...secao.itens.filter(i => i.status === 'nao_conforme'));
      extras.set(base, lista);
      continue;
    }
    const itens = new Map(secao.itens.map(i => [i.id, i]));
    paineis.push({
      chave: base,
      painel: partes[partes.length - 1] || '',
      area: partes[0] || '',
      subarea: partes.slice(1, -1).join(' › '),
      itens,
    });
  }
  return { paineis, extras };
}

/* ------------------------------------------------------------ montagem */
function montarLinhas({ paineis, extras }) {
  const linhas = [];
  const avisos = [];

  paineis.forEach((p, i) => {
    const valores = {
      [COL_ITEM]: String(i + 1),
      [COL_PAINEL]: p.painel,
      [COL_AREA]: p.area,
      [COL_SUBAREA]: p.subarea,
    };

    const semResposta = [];
    for (const [col, id] of COLUNAS) {
      const item = p.itens.get(id);
      if (!item || item.status === null || item.status === undefined) {
        // Sem resposta em campo. NUNCA deixar em branco: em branco o item não
        // casa com nenhum glifo, entra inteiro no denominador do ranking E
        // recebe pontuação cheia — item nunca olhado vira item aprovado.
        // Marcado como NA, sai do denominador e o ranking reflete só o que foi
        // de fato inspecionado.
        valores[col] = GLIFO.nao_aplica;
        semResposta.push(id);
      } else {
        valores[col] = GLIFO[item.status] ?? GLIFO.nao_aplica;
      }
    }

    let outras = [];
    for (const item of p.itens.values()) {
      if (!MAPEADOS.has(item.id) && !IGNORADOS.has(item.id)
          && item.status === 'nao_conforme') {
        outras.push(`${item.nc}: ${item.texto}`);
      }
    }
    for (const item of (extras.get(p.chave) || [])) {
      outras.push(`${item.nc}: ${item.texto}`);
    }

    let semRanking = false;
    if (semResposta.length === COLUNAS.length) {
      // Todos NA => denominador zero => #DIV/0! em cascata (o modelo não tem
      // guarda). Ranking indefinido não é ranking zero, e muito menos 100%.
      outras = ['[ATENCAO] PAINEL NAO INSPECIONADO - nenhum item respondido. ' +
                'Ranking nao aplicavel. Verificar se este painel existe de fato.'];
      semRanking = true;
      avisos.push(`Painel não inspecionado: ${p.chave}`);
    } else if (semResposta.length) {
      const nomes = semResposta
        .map(id => (p.itens.get(id)?.texto || id).replace(/\?$/, ''))
        .join(', ');
      outras.push(`[ATENCAO] ${semResposta.length} item(ns) NAO inspecionado(s) ` +
                  `em campo, lancado(s) como NA e excluido(s) do ranking: ${nomes}`);
      avisos.push(`${semResposta.length} item(ns) sem resposta em ${p.chave}`);
    }

    valores[COL_OUTRAS] = outras.length ? outras.join(' | ') : null;
    linhas.push({ valores, semRanking, textoOutras: valores[COL_OUTRAS] });
  });

  return { linhas, avisos };
}

/* ------------------------------------------------------- geração do xlsx */
async function gerarPlanilha({ modeloBytes, dados, cliente, logoBytes }) {
  const zip = await JSZip.loadAsync(modeloBytes);

  const interpretado = interpretarDados(dados);
  const { linhas, avisos } = montarLinhas(interpretado);

  if (linhas.length > ULTIMA_LINHA - LINHA_INICIAL + 1) {
    throw new Error(`A inspeção tem ${linhas.length} painéis e o modelo comporta ` +
                    `${ULTIMA_LINHA - LINHA_INICIAL + 1}. Amplie o modelo antes de gerar.`);
  }

  /* ---- aba Resultado da inspeção ---- */
  let xml = await zip.file(ABA_RESULTADO).async('string');
  let idx = indexarLinhas(xml);
  const edicoes = new Map();

  // Título (célula mesclada B1)
  const tituloPartes = ['PLANILHA DE INSPEÇÃO PAINÉIS ELÉTRICOS', cliente.nome,
                        cliente.cidade, cliente.estado].filter(Boolean);
  const l1 = idx.get(1);
  if (l1) edicoes.set(1, editarLinha(l1.texto, { B: '   ' + tituloPartes.join(' - ') }));

  linhas.forEach((linha, i) => {
    const nLin = LINHA_INICIAL + i;
    const r = idx.get(nLin);
    if (!r) return;
    const valores = { ...linha.valores };
    if (linha.semRanking) valores[COL_RANKING] = null;   // limpa a fórmula
    let texto = editarLinha(r.texto, valores);

    // A coluna U tem quebra de texto, mas a linha vem com altura fixa de 54pt.
    // Texto maior que isso o Excel corta calado — e o aviso de item não
    // inspecionado é justamente o texto mais longo da planilha.
    if (linha.textoOutras) {
      const nl = Math.ceil(linha.textoOutras.length / CHARS_POR_LINHA);
      const alt = Math.max(ALTURA_PADRAO, nl * ALTURA_LINHA_TEXTO);
      texto = texto.replace(/^<row[^>]*>/, t => definirAltura(t, alt));
    }
    edicoes.set(nLin, texto);
  });

  // Limpa as linhas fantasma (o modelo vem pré-numerado até 343 painéis)
  for (let n = LINHA_INICIAL + linhas.length; n <= ULTIMA_LINHA; n++) {
    const r = idx.get(n);
    if (r) edicoes.set(n, limparLinha(r.texto, COLS_RESULTADO[0],
                                      COLS_RESULTADO[COLS_RESULTADO.length - 1]));
  }

  // Fórmula órfã com #REF! herdada do modelo
  const l8 = edicoes.get(8) || idx.get(8)?.texto;
  if (l8) edicoes.set(8, editarLinha(l8, { V: null }));

  xml = aplicar(xml, idx, edicoes);
  zip.file(ABA_RESULTADO, xml);

  /* ---- aba Ranking: zera as linhas sem painel ou não inspecionadas ---- */
  let xmlR = await zip.file(ABA_RANKING).async('string');
  const idxR = indexarLinhas(xmlR);
  const edicoesR = new Map();
  const zerar = n => {
    const r = idxR.get(n);
    if (r) edicoesR.set(n, limparLinha(r.texto, 'B', 'AU'));
  };
  linhas.forEach((l, i) => { if (l.semRanking) zerar(LINHA_INICIAL + i); });
  for (let n = LINHA_INICIAL + linhas.length; n <= ULTIMA_LINHA; n++) zerar(n);
  xmlR = aplicar(xmlR, idxR, edicoesR);
  zip.file(ABA_RANKING, xmlR);

  /* ---- recálculo forçado ao abrir ----
     O modelo guarda valores em cache (T6 vem com <v>1</v> = 100%). Sem isto o
     Excel mostraria 100% em todos os painéis até alguém apertar Ctrl+Alt+F9. */
  let wbx = await zip.file('xl/workbook.xml').async('string');
  wbx = /<calcPr[^>]*\/>/.test(wbx)
    ? wbx.replace(/<calcPr([^>]*?)\/>/, '<calcPr$1 fullCalcOnLoad="1"/>')
    : wbx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/workbook.xml', wbx);

  /* ---- logo do cliente ---- */
  if (logoBytes) zip.file(LOGO_CLIENTE, logoBytes);

  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    compression: 'DEFLATE',
  });

  return { blob, totalPaineis: linhas.length, avisos };
}
