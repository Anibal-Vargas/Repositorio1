// db.js — camada de dados (Dexie / IndexedDB).
// Toda mutação salva imediatamente: não existe botão "salvar" no app.
// Dexie é carregado como script global em index.html (vendor/dexie.min.js).

export const db = new Dexie('inspecoes_eletricas');

db.version(1).stores({
  // chave/valor: inspetor, flags de primeiro uso etc.
  config: '&chave',
  clientes: '++id, nome',
  // status: 'aberta' | 'finalizada'
  inspecoes: '++id, status, clienteId, atualizadoEm',
  // parentId === null → área raiz; senão sub-área (1 nível apenas)
  areas: '++id, inspecaoId, parentId',
  ncs: '++id, inspecaoId, areaId',
  fotos: '++id, ncId, inspecaoId',
  audios: '++id, ncId, inspecaoId',
});

// v2 (Fase 4): respostas de checklist — uma por item por inspeção.
// status: 'conforme' | 'nao_conforme' | 'nao_aplica' | null (não verificado)
db.version(2).stores({
  respostas: '++id, inspecaoId, ncId, &[inspecaoId+itemId]',
});

// v3: itens de checklist adicionados pelo inspetor em campo.
db.version(3).stores({
  itensExtras: '++id, inspecaoId, &itemId',
});

// ---------- config ----------

export async function obterConfig(chave) {
  const registro = await db.config.get(chave);
  return registro ? registro.valor : null;
}

export async function definirConfig(chave, valor) {
  await db.config.put({ chave, valor });
}

export function obterInspetor() {
  return obterConfig('inspetor');
}

export function salvarInspetor(inspetor) {
  return definirConfig('inspetor', inspetor);
}

// ---------- clientes ----------

export function listarClientes() {
  return db.clientes.orderBy('nome').toArray();
}

export async function criarCliente(nome) {
  const id = await db.clientes.add({ nome: nome.trim(), criadoEm: Date.now() });
  return db.clientes.get(id);
}

// ---------- inspeções ----------

export async function criarInspecao(clienteId, tipo, inspetorNome = null) {
  if (inspetorNome === null) {
    const inspetor = await obterInspetor();
    inspetorNome = inspetor ? inspetor.nome : '';
  }
  const agora = Date.now();
  const id = await db.inspecoes.add({
    clienteId,
    tipo,
    status: 'aberta',
    inspetorNome,
    contadorNC: 0,
    criadoEm: agora,
    atualizadoEm: agora,
  });
  return id;
}

export function obterInspecao(id) {
  return db.inspecoes.get(id);
}

export function listarInspecoesAbertas() {
  return db.inspecoes.where('status').equals('aberta').reverse().sortBy('atualizadoEm');
}

export function listarInspecoesFinalizadas() {
  return db.inspecoes.where('status').equals('finalizada').reverse().sortBy('atualizadoEm');
}

export async function finalizarInspecao(id) {
  await db.inspecoes.update(id, {
    status: 'finalizada', finalizadaEm: Date.now(), atualizadoEm: Date.now(),
  });
}

export async function reabrirInspecao(id) {
  await db.inspecoes.update(id, { status: 'aberta', atualizadoEm: Date.now() });
}

function tocarInspecao(id) {
  return db.inspecoes.update(id, { atualizadoEm: Date.now() });
}

/** Progresso de uma inspeção: contagens para as listas de retomada. */
export async function progressoInspecao(inspecaoId) {
  const [areas, ncs, fotos] = await Promise.all([
    db.areas.where('inspecaoId').equals(inspecaoId).count(),
    db.ncs.where('inspecaoId').equals(inspecaoId).count(),
    db.fotos.where('inspecaoId').equals(inspecaoId).count(),
  ]);
  return { areas, ncs, fotos };
}

// ---------- áreas / sub-áreas ----------

export async function criarArea(inspecaoId, nome, parentId = null) {
  const id = await db.areas.add({
    inspecaoId,
    parentId,
    nome: nome.trim(),
    criadoEm: Date.now(),
  });
  await tocarInspecao(inspecaoId);
  return id;
}

export function obterArea(id) {
  return db.areas.get(id);
}

export async function listarAreas(inspecaoId, parentId = null) {
  const todas = await db.areas.where('inspecaoId').equals(inspecaoId).sortBy('criadoEm');
  return todas.filter((a) => (a.parentId ?? null) === parentId);
}

// ---------- NCs ----------

/**
 * Cria uma NC com numeração sequencial por inspeção (NC-001, NC-002…).
 * Transação garante que dois toques rápidos não repitam número.
 */
export async function criarNC(inspecaoId, areaId, extras = {}) {
  return db.transaction('rw', db.inspecoes, db.ncs, async () => {
    const inspecao = await db.inspecoes.get(inspecaoId);
    const numero = (inspecao.contadorNC || 0) + 1;
    await db.inspecoes.update(inspecaoId, { contadorNC: numero, atualizadoEm: Date.now() });
    const id = await db.ncs.add({
      inspecaoId,
      areaId,
      // NCs de checklist: areaId === null e o item fica registrado aqui
      // (itemTexto é cópia do texto na hora do registro, para o relatório
      // não mudar se o checklist for atualizado depois).
      itemId: extras.itemId ?? null,
      itemTexto: extras.itemTexto ?? null,
      numero: `NC-${String(numero).padStart(3, '0')}`,
      descricao: '',
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
    });
    return id;
  });
}

export function obterNC(id) {
  return db.ncs.get(id);
}

export function listarNCsDaArea(areaId) {
  return db.ncs.where('areaId').equals(areaId).sortBy('criadoEm');
}

export function contarNCsDaArea(areaId) {
  return db.ncs.where('areaId').equals(areaId).count();
}

export async function atualizarDescricaoNC(id, descricao) {
  const nc = await db.ncs.get(id);
  await db.ncs.update(id, { descricao, atualizadoEm: Date.now() });
  await tocarInspecao(nc.inspecaoId);
}

/** Exclui a NC e tudo que pertence a ela (fotos e áudios). */
export async function excluirNC(id) {
  const nc = await db.ncs.get(id);
  await db.transaction('rw', db.ncs, db.fotos, db.audios, db.respostas, async () => {
    await db.fotos.where('ncId').equals(id).delete();
    await db.audios.where('ncId').equals(id).delete();
    // Item de checklist vinculado volta para "não verificado".
    await db.respostas.where('ncId').equals(id).modify({ ncId: null, status: null });
    await db.ncs.delete(id);
  });
  if (nc) await tocarInspecao(nc.inspecaoId);
}

// ---------- respostas de checklist ----------

export function obterRespostas(inspecaoId) {
  return db.respostas.where('inspecaoId').equals(inspecaoId).toArray();
}

async function gravarResposta(inspecaoId, itemId, campos) {
  const existente = await db.respostas
    .where('[inspecaoId+itemId]').equals([inspecaoId, itemId]).first();
  if (existente) {
    await db.respostas.update(existente.id, { ...campos, atualizadoEm: Date.now() });
  } else {
    await db.respostas.add({
      inspecaoId, itemId, ncId: null, status: null,
      ...campos, atualizadoEm: Date.now(),
    });
  }
  await tocarInspecao(inspecaoId);
}

/** Marca conforme / não se aplica / null (limpa). */
export function definirResposta(inspecaoId, itemId, status) {
  return gravarResposta(inspecaoId, itemId, { status });
}

/** Marca não conforme: cria a NC vinculada e retorna o id dela. */
export async function responderNaoConforme(inspecaoId, itemId, itemTexto) {
  const ncId = await criarNC(inspecaoId, null, { itemId, itemTexto });
  await gravarResposta(inspecaoId, itemId, { status: 'nao_conforme', ncId });
  return ncId;
}

// ---------- itens extras (adicionados em campo) ----------

export function listarItensExtras(inspecaoId) {
  return db.itensExtras.where('inspecaoId').equals(inspecaoId).sortBy('criadoEm');
}

export function contarItensExtras(inspecaoId) {
  return db.itensExtras.where('inspecaoId').equals(inspecaoId).count();
}

export async function criarItemExtra(inspecaoId, texto) {
  const itemId = `extra-${inspecaoId}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
  await db.itensExtras.add({ inspecaoId, itemId, texto: texto.trim(), criadoEm: Date.now() });
  await tocarInspecao(inspecaoId);
  return itemId;
}

/** Exclui o item extra, a resposta e a NC vinculada (se houver). */
export async function excluirItemExtra(inspecaoId, itemId) {
  const resposta = await db.respostas
    .where('[inspecaoId+itemId]').equals([inspecaoId, itemId]).first();
  if (resposta && resposta.ncId) await excluirNC(resposta.ncId);
  await db.transaction('rw', db.itensExtras, db.respostas, async () => {
    await db.itensExtras.where('itemId').equals(itemId).delete();
    await db.respostas.where('[inspecaoId+itemId]').equals([inspecaoId, itemId]).delete();
  });
  await tocarInspecao(inspecaoId);
}

// ---------- fotos ----------

export const MAX_FOTOS_POR_NC = 20;

export async function adicionarFoto(ncId, blob) {
  const nc = await db.ncs.get(ncId);
  const id = await db.fotos.add({
    ncId,
    inspecaoId: nc.inspecaoId,
    blob,
    criadoEm: Date.now(),
  });
  await tocarInspecao(nc.inspecaoId);
  return id;
}

export function listarFotos(ncId) {
  return db.fotos.where('ncId').equals(ncId).sortBy('criadoEm');
}

export function contarFotos(ncId) {
  return db.fotos.where('ncId').equals(ncId).count();
}

export async function excluirFoto(id) {
  await db.fotos.delete(id);
}

// ---------- áudios ----------

export async function adicionarAudio(ncId, blob, mime) {
  const nc = await db.ncs.get(ncId);
  const id = await db.audios.add({
    ncId,
    inspecaoId: nc.inspecaoId,
    blob,
    mime,
    criadoEm: Date.now(),
  });
  await tocarInspecao(nc.inspecaoId);
  return id;
}

export function listarAudios(ncId) {
  return db.audios.where('ncId').equals(ncId).sortBy('criadoEm');
}

export async function excluirAudio(id) {
  await db.audios.delete(id);
}
