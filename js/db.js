// Camada de dados (Dexie / IndexedDB).
// Entidades: Cliente → Máquina/Equipamento → Inspeção → Medições (checklist) → Fotos.
// Versionamento sempre aditivo: nunca alterar versões antigas já publicadas.

const db = new Dexie('aterramento-nord');

db.version(1).stores({
  clientes: '++id, nome',
  equipamentos: '++id, clienteId, nome',
  inspecoes: '++id, clienteId, criadaEm, status',
  medicoes: '++id, inspecaoId, equipamentoId, [inspecaoId+equipamentoId]',
  fotos: '++id, inspecaoId, equipamentoId, [inspecaoId+equipamentoId]',
});

// Checklist padrão de continuidade de aterramento aplicado a cada equipamento.
// `temMedicao` indica pontos com valor medido em ohms (limite referencial 0,1 Ω).
export const CHECKLIST_PADRAO = [
  { descricao: 'Condutor de proteção (fio terra) presente e sem danos', temMedicao: false },
  { descricao: 'Conexões de aterramento firmes e sem oxidação', temMedicao: false },
  { descricao: 'Continuidade: carcaça da máquina ↔ barra de terra do painel', temMedicao: true },
  { descricao: 'Continuidade: porta do painel ↔ estrutura do painel', temMedicao: true },
  { descricao: 'Continuidade: motor ↔ barra de terra', temMedicao: true },
  { descricao: 'Continuidade: partes metálicas expostas ↔ barra de terra', temMedicao: true },
];

export const LIMITE_OHMS = 0.1;

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

export async function excluirCliente(id) {
  const clienteId = Number(id);
  const equipamentos = await db.equipamentos.where('clienteId').equals(clienteId).toArray();
  const inspecoes = await db.inspecoes.where('clienteId').equals(clienteId).toArray();
  await db.transaction('rw', db.clientes, db.equipamentos, db.inspecoes, db.medicoes, db.fotos, async () => {
    for (const inspecao of inspecoes) {
      await db.medicoes.where('inspecaoId').equals(inspecao.id).delete();
      await db.fotos.where('inspecaoId').equals(inspecao.id).delete();
    }
    await db.inspecoes.where('clienteId').equals(clienteId).delete();
    await db.equipamentos.bulkDelete(equipamentos.map((e) => e.id));
    await db.clientes.delete(clienteId);
  });
}

/* ---------------- Equipamentos ---------------- */

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

export async function atualizarEquipamento(id, mudancas) {
  return db.equipamentos.update(Number(id), mudancas);
}

export async function excluirEquipamento(id) {
  const equipamentoId = Number(id);
  await db.transaction('rw', db.equipamentos, db.medicoes, db.fotos, async () => {
    await db.medicoes.where('equipamentoId').equals(equipamentoId).delete();
    await db.fotos.where('equipamentoId').equals(equipamentoId).delete();
    await db.equipamentos.delete(equipamentoId);
  });
}

/* ---------------- Inspeções ---------------- */

export async function listarInspecoes() {
  return db.inspecoes.orderBy('criadaEm').reverse().toArray();
}

export async function obterInspecao(id) {
  return db.inspecoes.get(Number(id));
}

export async function criarInspecao(clienteId, responsavel = '', instrumento = '') {
  return db.inspecoes.add({
    clienteId: Number(clienteId),
    responsavel: responsavel.trim(),
    instrumento: instrumento.trim(),
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
  await db.transaction('rw', db.inspecoes, db.medicoes, db.fotos, async () => {
    await db.medicoes.where('inspecaoId').equals(inspecaoId).delete();
    await db.fotos.where('inspecaoId').equals(inspecaoId).delete();
    await db.inspecoes.delete(inspecaoId);
  });
}

/* ---------------- Medições (checklist por equipamento na inspeção) ---------------- */

// Lista os equipamentos já incluídos numa inspeção (ids distintos).
export async function equipamentosDaInspecao(inspecaoId) {
  const medicoes = await db.medicoes.where('inspecaoId').equals(Number(inspecaoId)).toArray();
  const ids = [...new Set(medicoes.map((m) => m.equipamentoId))];
  const equipamentos = await db.equipamentos.bulkGet(ids);
  return equipamentos.filter(Boolean).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// Inclui um equipamento na inspeção criando o checklist padrão (se ainda não existir).
export async function incluirEquipamentoNaInspecao(inspecaoId, equipamentoId) {
  const existentes = await db.medicoes
    .where('[inspecaoId+equipamentoId]')
    .equals([Number(inspecaoId), Number(equipamentoId)])
    .count();
  if (existentes > 0) return false;
  await db.medicoes.bulkAdd(
    CHECKLIST_PADRAO.map((item, ordem) => ({
      inspecaoId: Number(inspecaoId),
      equipamentoId: Number(equipamentoId),
      ordem,
      descricao: item.descricao,
      temMedicao: item.temMedicao,
      resultado: null, // 'conforme' | 'nc' | 'na'
      valorOhms: '',
      observacao: '',
    }))
  );
  return true;
}

export async function listarMedicoes(inspecaoId, equipamentoId) {
  const medicoes = await db.medicoes
    .where('[inspecaoId+equipamentoId]')
    .equals([Number(inspecaoId), Number(equipamentoId)])
    .toArray();
  return medicoes.sort((a, b) => a.ordem - b.ordem);
}

export async function listarMedicoesDaInspecao(inspecaoId) {
  return db.medicoes.where('inspecaoId').equals(Number(inspecaoId)).toArray();
}

export async function atualizarMedicao(id, mudancas) {
  return db.medicoes.update(Number(id), mudancas);
}

export async function removerEquipamentoDaInspecao(inspecaoId, equipamentoId) {
  await db.transaction('rw', db.medicoes, db.fotos, async () => {
    await db.medicoes
      .where('[inspecaoId+equipamentoId]')
      .equals([Number(inspecaoId), Number(equipamentoId)])
      .delete();
    await db.fotos
      .where('[inspecaoId+equipamentoId]')
      .equals([Number(inspecaoId), Number(equipamentoId)])
      .delete();
  });
}

// Resumo do checklist de um equipamento: { total, respondidas, nc }.
export async function resumoDoEquipamento(inspecaoId, equipamentoId) {
  const medicoes = await listarMedicoes(inspecaoId, equipamentoId);
  return {
    total: medicoes.length,
    respondidas: medicoes.filter((m) => m.resultado !== null).length,
    nc: medicoes.filter((m) => m.resultado === 'nc').length,
  };
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

export async function adicionarFoto(inspecaoId, equipamentoId, blob) {
  return db.fotos.add({
    inspecaoId: Number(inspecaoId),
    equipamentoId: Number(equipamentoId),
    blob,
    criadaEm: Date.now(),
  });
}

export async function excluirFoto(id) {
  return db.fotos.delete(Number(id));
}

export async function contarFotos(inspecaoId, equipamentoId) {
  return db.fotos
    .where('[inspecaoId+equipamentoId]')
    .equals([Number(inspecaoId), Number(equipamentoId)])
    .count();
}
