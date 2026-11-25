// zipunico.js — monta um .zip ÚNICO, de qualquer tamanho, sem copiar as
// fotos para a memória.
//
// O .zip final é um Blob composto de pedaços: cabeçalhos pequenos gerados
// aqui + os próprios Blobs das fotos/áudios já guardados no aparelho
// (IndexedDB). O navegador só lê cada arquivo uma vez, em fatias, para
// calcular o CRC-32 que o formato exige — a memória usada não cresce com o
// tamanho da inspeção.
//
// Arquivos são gravados sem compressão (método "store": fotos e áudios já
// são comprimidos). Nomes em UTF-8. Acima de 4 GB (ou 65.535 entradas) usa
// a extensão ZIP64, lida pelo Windows, 7-Zip, Python etc.

const FATIA = 4 * 1024 * 1024;
const MAX32 = 0xFFFFFFFF;
const MAX16 = 0xFFFF;

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crcParcial(crc, bytes) {
  for (let i = 0; i < bytes.length; i++) crc = TABELA_CRC[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return crc;
}

/** CRC-32 de um Blob, lido em fatias de 4 MB. */
async function crcDoBlob(blob, aoLer) {
  let crc = 0xFFFFFFFF;
  for (let pos = 0; pos < blob.size; pos += FATIA) {
    const fatia = new Uint8Array(await blob.slice(pos, pos + FATIA).arrayBuffer());
    crc = crcParcial(crc, fatia);
    if (aoLer) aoLer(fatia.length);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dataHoraDOS(data) {
  return {
    hora: (data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1),
    dia: ((Math.max(1980, data.getFullYear()) - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate(),
  };
}

function u64(visao, pos, valor) {
  visao.setUint32(pos, valor % 2 ** 32, true);
  visao.setUint32(pos + 4, Math.floor(valor / 2 ** 32), true);
}

/**
 * Monta o .zip. entradas: [{ nome, conteudo }] — conteudo é Blob, texto
 * (gravado em UTF-8) ou null para uma pasta (nome terminado em "/"). As
 * pastas-mãe de cada arquivo são criadas automaticamente.
 * opcoes: aoProgredir(percentual), limite32 (só para testes do ZIP64).
 * Retorna um Blob application/zip.
 */
export async function montarZip(entradas, opcoes = {}) {
  const { aoProgredir = null, limite32 = MAX32 } = opcoes;
  const codificar = new TextEncoder();
  const { hora, dia } = dataHoraDOS(new Date());

  // Pastas-mãe antes do primeiro arquivo de cada uma (como no formato anterior).
  const lista = [];
  const pastas = new Set();
  const garantirPasta = (caminho) => {
    if (!caminho || pastas.has(caminho)) return;
    garantirPasta(caminho.slice(0, caminho.slice(0, -1).lastIndexOf('/') + 1));
    pastas.add(caminho);
    lista.push({ nome: caminho, conteudo: null });
  };
  for (const entrada of entradas) {
    const ehPasta = entrada.conteudo === null;
    const nome = ehPasta && !entrada.nome.endsWith('/') ? `${entrada.nome}/` : entrada.nome;
    garantirPasta(nome.slice(0, nome.slice(0, -1).lastIndexOf('/') + 1));
    if (ehPasta) garantirPasta(nome);
    else lista.push({ nome, conteudo: typeof entrada.conteudo === 'string' ? codificar.encode(entrada.conteudo) : entrada.conteudo });
  }

  const totalBytes = lista.reduce((s, e) => s + (e.conteudo ? (e.conteudo.size ?? e.conteudo.length) : 0), 0) || 1;
  let lidos = 0;
  const progresso = (n) => {
    lidos += n;
    if (aoProgredir) aoProgredir(Math.min(100, (lidos / totalBytes) * 100));
  };

  const partes = [];
  const central = [];
  let posicao = 0;

  for (const entrada of lista) {
    const nomeBytes = codificar.encode(entrada.nome);
    const conteudo = entrada.conteudo;
    const tamanho = conteudo ? (conteudo.size ?? conteudo.length) : 0;
    let crc = 0;
    if (conteudo instanceof Blob) crc = await crcDoBlob(conteudo, progresso);
    else if (conteudo) { crc = (crcParcial(0xFFFFFFFF, conteudo) ^ 0xFFFFFFFF) >>> 0; progresso(tamanho); }

    const deslocamentoGrande = posicao >= limite32;
    // Com ZIP64 na entrada, ela leva a extensão no cabeçalho local e no
    // central (tamanhos sempre no campo extra), como os demais compactadores.
    const grande = tamanho >= limite32 || deslocamentoGrande;
    const versao = grande || deslocamentoGrande ? 45 : 20;

    // ---- cabeçalho local ----
    const extraLocal = grande ? 20 : 0;
    const local = new Uint8Array(30 + nomeBytes.length + extraLocal);
    const vl = new DataView(local.buffer);
    vl.setUint32(0, 0x04034b50, true);
    vl.setUint16(4, versao, true);
    vl.setUint16(6, 0x0800, true); // nomes em UTF-8
    vl.setUint16(8, 0, true); // sem compressão
    vl.setUint16(10, hora, true);
    vl.setUint16(12, dia, true);
    vl.setUint32(14, crc, true);
    vl.setUint32(18, grande ? MAX32 : tamanho, true);
    vl.setUint32(22, grande ? MAX32 : tamanho, true);
    vl.setUint16(26, nomeBytes.length, true);
    vl.setUint16(28, extraLocal, true);
    local.set(nomeBytes, 30);
    if (grande) {
      const p = 30 + nomeBytes.length;
      vl.setUint16(p, 0x0001, true);
      vl.setUint16(p + 2, 16, true);
      u64(vl, p + 4, tamanho);
      u64(vl, p + 12, tamanho);
    }
    partes.push(local);
    if (conteudo) partes.push(conteudo);

    // ---- registro do diretório central ----
    const camposZip64 = [];
    if (grande) camposZip64.push(tamanho, tamanho);
    if (deslocamentoGrande) camposZip64.push(posicao);
    const extraCentral = camposZip64.length ? 4 + 8 * camposZip64.length : 0;
    const reg = new Uint8Array(46 + nomeBytes.length + extraCentral);
    const vc = new DataView(reg.buffer);
    vc.setUint32(0, 0x02014b50, true);
    vc.setUint16(4, versao, true);
    vc.setUint16(6, versao, true);
    vc.setUint16(8, 0x0800, true);
    vc.setUint16(10, 0, true);
    vc.setUint16(12, hora, true);
    vc.setUint16(14, dia, true);
    vc.setUint32(16, crc, true);
    vc.setUint32(20, grande ? MAX32 : tamanho, true);
    vc.setUint32(24, grande ? MAX32 : tamanho, true);
    vc.setUint16(28, nomeBytes.length, true);
    vc.setUint16(30, extraCentral, true);
    vc.setUint32(38, conteudo ? 0 : 0x10, true); // atributo de pasta (DOS)
    vc.setUint32(42, deslocamentoGrande ? MAX32 : posicao, true);
    reg.set(nomeBytes, 46);
    if (camposZip64.length) {
      let p = 46 + nomeBytes.length;
      vc.setUint16(p, 0x0001, true);
      vc.setUint16(p + 2, 8 * camposZip64.length, true);
      p += 4;
      for (const valor of camposZip64) { u64(vc, p, valor); p += 8; }
    }
    central.push(reg);
    posicao += local.length + tamanho;
  }

  const inicioCentral = posicao;
  const tamanhoCentral = central.reduce((s, r) => s + r.length, 0);
  partes.push(...central);
  const fimCentral = inicioCentral + tamanhoCentral;
  const precisaZip64 = lista.length > MAX16 || inicioCentral >= limite32 || tamanhoCentral >= limite32 ||
    central.some((r) => new DataView(r.buffer).getUint16(6, true) === 45);

  if (precisaZip64) {
    const z64 = new Uint8Array(56 + 20);
    const v = new DataView(z64.buffer);
    v.setUint32(0, 0x06064b50, true); // registro de fim ZIP64
    u64(v, 4, 44);
    v.setUint16(12, 45, true);
    v.setUint16(14, 45, true);
    u64(v, 24, lista.length);
    u64(v, 32, lista.length);
    u64(v, 40, tamanhoCentral);
    u64(v, 48, inicioCentral);
    v.setUint32(56, 0x07064b50, true); // localizador ZIP64
    u64(v, 64, fimCentral);
    v.setUint32(72, 1, true);
    partes.push(z64);
  }

  const fim = new Uint8Array(22);
  const vf = new DataView(fim.buffer);
  vf.setUint32(0, 0x06054b50, true);
  // Só o campo que não cabe vai como "estourado" (-1); os demais ficam com o
  // valor real, para leitores que não conhecem ZIP64.
  const entradasFim = lista.length > MAX16 ? MAX16 : lista.length;
  vf.setUint16(8, entradasFim, true);
  vf.setUint16(10, entradasFim, true);
  vf.setUint32(12, tamanhoCentral >= limite32 ? MAX32 : tamanhoCentral, true);
  vf.setUint32(16, inicioCentral >= limite32 ? MAX32 : inicioCentral, true);
  partes.push(fim);

  if (aoProgredir) aoProgredir(100);
  return new Blob(partes, { type: 'application/zip' });
}
