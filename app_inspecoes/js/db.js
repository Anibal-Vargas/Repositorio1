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
export async function criarNC(inspecaoId, areaId) {
  return db.transaction('rw', db.inspecoes, db.ncs, async () => {
    const inspecao = await db.inspecoes.get(inspecaoId);
    const numero = (inspecao.contadorNC || 0) + 1;
    await db.inspecoes.update(inspecaoId, { contadorNC: numero, atualizadoEm: Date.now() });
    const id = await db.ncs.add({
      inspecaoId,
      areaId,
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
  await db.transaction('rw', db.ncs, db.fotos, db.audios, async () => {
    await db.fotos.where('ncId').equals(id).delete();
    await db.audios.where('ncId').equals(id).delete();
    await db.ncs.delete(id);
  });
  if (nc) await tocarInspecao(nc.inspecaoId);
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
