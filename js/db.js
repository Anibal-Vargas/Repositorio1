// Camada de dados (Dexie / IndexedDB).
// Entidades: Cliente → Máquina/Equipamento → Inspeção → Registro (fotos, áudios, observação).
// Versionamento sempre aditivo: nunca alterar versões antigas já publicadas.

const db = new Dexie('aterramento-nord');

db.version(1).stores({
  clientes: '++id, nome',
  equipamentos: '++id, clienteId, nome',
  inspecoes: '++id, clienteId, criadaEm, status',
  medicoes: '++id, inspecaoId, equipamentoId, [inspecaoId+equipamentoId]',
  fotos: '++id, inspecaoId, equipamentoId, [inspecaoId+equipamentoId]',
});

// v2: o checklist deu lugar ao registro fotográfico por máquina/equipamento
// (fotos por categoria, áudios e observação) e à lista de inspetores.
db.version(2).stores({
  medicoes: null,
  registros: '++id, inspecaoId, equipamentoId, [inspecaoId+equipamentoId]',
  audios: '++id, inspecaoId, equipamentoId, [inspecaoId+equipamentoId]',
  inspetores: '++id, &nome',
});

export const INSPETORES_PADRAO = [
  'Adauto Muller',
  'Aníbal Vargas',
  'Hugo Araújo',
  'Leonardo Oliveira',
  'Thiago Lazzarin',
];

// Categorias de foto do registro de cada máquina/equipamento.
export const CATEGORIAS_FOTO = [
  { id: 'maquina', numero: '01', rotulo: 'Foto da máquina/equipamento', obrigatoria: true, limite: 1 },
  { id: 'valor', numero: '02', rotulo: 'Foto do valor medido', obrigatoria: true, limite: 1 },
  { id: 'prancheta', numero: '03', rotulo: 'Foto da prancheta', obrigatoria: false, limite: 1 },
  { id: 'adicional', numero: '04', rotulo: 'Fotos adicionais', obrigatoria: false, limite: 10 },
];

/* ---------------- Inspetores ---------------- */

export async function listarInspetores() {
  await db.inspetores
    .bulkAdd(INSPETORES_PADRAO.map((nome) => ({ nome })))
    .catch(() => {}); // nomes já existentes são ignorados (índice único)
  return db.inspetores.orderBy('nome').toArray();
}

export async function criarInspetor(nome) {
  try {
    await db.inspetores.add({ nome: nome.trim() });
  } catch {
    /* nome já cadastrado */
  }
  return nome.trim();
}

/* ---------------- Clientes ---------------- */

export async function listarClientes() {
  return db.clientes.orderBy('nome').toArray();
}

export async function obterCliente(id) {
  return db.clientes.get(Number(id));
}

export async function criarCliente(nome) {
  return db.clientes.add({ nome: nome.trim(), criadoEm: Date.now() });
}

/* ---------------- Máquinas/Equipamentos ---------------- */

export async function listarEquipamentos(clienteId) {
  return db.equipamentos.where('clienteId').equals(Number(clienteId)).sortBy('nome');
}

export async function obterEquipamento(id) {
  return db.equipamentos.get(Number(id));
}

export async function criarEquipamento(clienteId, nome, setor = '') {
  return db.equipamentos.add({
    clienteId: Number(clienteId),
    nome: nome.trim(),
    setor: setor.trim(),
    criadoEm: Date.now(),
  });
}

/* ---------------- Inspeções ---------------- */

export async function listarInspecoes() {
  return db.inspecoes.orderBy('criadaEm').reverse().toArray();
}

export async function obterInspecao(id) {
  return db.inspecoes.get(Number(id));
}

export async function criarInspecao(clienteId, inspetor = '') {
  return db.inspecoes.add({
    clienteId: Number(clienteId),
    inspetor: inspetor.trim(),
    observacoes: '',
    status: 'em-andamento',
    criadaEm: Date.now(),
  });
}

export async function atualizarInspecao(id, mudancas) {
  return db.inspecoes.update(Number(id), mudancas);
}

export async function excluirInspecao(id) {
  const inspecaoId = Number(id);
  await db.transaction('rw', db.inspecoes, db.registros, db.fotos, db.audios, async () => {
    await db.registros.where('inspecaoId').equals(inspecaoId).delete();
    await db.fotos.where('inspecaoId').equals(inspecaoId).delete();
    await db.audios.where('inspecaoId').equals(inspecaoId).delete();
    await db.inspecoes.delete(inspecaoId);
  });
}

/* ---------------- Registros (máquina/equipamento na inspeção) ---------------- */

// Lista as máquinas/equipamentos já incluídos numa inspeção.
export async function equipamentosDaInspecao(inspecaoId) {
  const registros = await db.registros.where('inspecaoId').equals(Number(inspecaoId)).toArray();
  const equipamentos = await db.equipamentos.bulkGet(registros.map((r) => r.equipamentoId));
  return equipamentos.filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Inclui uma máquina/equipamento na inspeção criando o registro (se ainda não existir).
export async function incluirEquipamentoNaInspecao(inspecaoId, equipamentoId) {
  const existente = await obterRegistro(inspecaoId, equipamentoId);
  if (existente) return false;
  await db.registros.add({
    inspecaoId: Number(inspecaoId),
    equipamentoId: Number(equipamentoId),
    observacao: '',
    criadoEm: Date.now(),
  });
  return true;
}

export async function obterRegistro(inspecaoId, equipamentoId) {
  return db.registros
    .where('[inspecaoId+equipamentoId]')
    .equals([Number(inspecaoId), Number(equipamentoId)])
    .first();
}

export async function atualizarRegistro(id, mudancas) {
  return db.registros.update(Number(id), mudancas);
}

export async function removerEquipamentoDaInspecao(inspecaoId, equipamentoId) {
  const chave = [Number(inspecaoId), Number(equipamentoId)];
  await db.transaction('rw', db.registros, db.fotos, db.audios, async () => {
    await db.registros.where('[inspecaoId+equipamentoId]').equals(chave).delete();
    await db.fotos.where('[inspecaoId+equipamentoId]').equals(chave).delete();
    await db.audios.where('[inspecaoId+equipamentoId]').equals(chave).delete();
  });
}

// Resumo do registro: { completo, pendentes } com base nas fotos obrigatórias.
export async function resumoDoEquipamento(inspecaoId, equipamentoId) {
  const fotos = await listarFotos(inspecaoId, equipamentoId);
  const pendentes = CATEGORIAS_FOTO.filter(
    (categoria) => categoria.obrigatoria && !fotos.some((f) => f.categoria === categoria.id)
  ).map((categoria) => categoria.rotulo);
  return { completo: pendentes.length === 0, pendentes, totalFotos: fotos.length };
}

/* ---------------- Fotos ---------------- */

export async function listarFotos(inspecaoId, equipamentoId) {
  return db.fotos
    .where('[inspecaoId+equipamentoId]')
    .equals([Number(inspecaoId), Number(equipamentoId)])
    .toArray();
}

export async function listarFotosDaInspecao(inspecaoId) {
  return db.fotos.where('inspecaoId').equals(Number(inspecaoId)).toArray();
}

export async function adicionarFoto(inspecaoId, equipamentoId, categoria, blob) {
  return db.fotos.add({
    inspecaoId: Number(inspecaoId),
    equipamentoId: Number(equipamentoId),
    categoria,
    blob,
    criadaEm: Date.now(),
  });
}

export async function excluirFoto(id) {
  return db.fotos.delete(Number(id));
}

/* ---------------- Áudios ---------------- */

export async function listarAudios(inspecaoId, equipamentoId) {
  return db.audios
    .where('[inspecaoId+equipamentoId]')
    .equals([Number(inspecaoId), Number(equipamentoId)])
    .toArray();
}

export async function adicionarAudio(inspecaoId, equipamentoId, blob) {
  return db.audios.add({
    inspecaoId: Number(inspecaoId),
    equipamentoId: Number(equipamentoId),
    blob,
    criadaEm: Date.now(),
  });
}

export async function excluirAudio(id) {
  return db.audios.delete(Number(id));
}
