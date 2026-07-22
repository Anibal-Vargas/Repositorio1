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

// v3: o setor vira entidade própria (um setor agrupa várias máquinas/equipamentos).
db.version(3)
  .stores({
    setores: '++id, clienteId, nome',
    equipamentos: '++id, clienteId, setorId, nome',
  })
  .upgrade(async (tx) => {
    // Migra o antigo campo de texto `setor` para a tabela de setores.
    const equipamentos = await tx.table('equipamentos').toArray();
    const mapa = new Map();
    for (const equipamento of equipamentos) {
      const nomeSetor = (equipamento.setor || '').trim();
      if (!nomeSetor) continue;
      const chave = `${equipamento.clienteId}|${nomeSetor.toLowerCase()}`;
      let setorId = mapa.get(chave);
      if (!setorId) {
        setorId = await tx.table('setores').add({
          clienteId: equipamento.clienteId,
          nome: nomeSetor,
          criadoEm: Date.now(),
        });
        mapa.set(chave, setorId);
      }
      await tx.table('equipamentos').update(equipamento.id, { setorId, setor: undefined });
    }
  });

export const INSPETORES_PADRAO = [
  'Adauto Muller',
  'Aníbal Vargas',
  'Hugo Araújo',
  'Leonardo Oliveira',
  'Thiago Lazzarin',
];

// Categorias de foto do registro de cada máquina/equipamento.
// Na exportação os arquivos recebem nomes fixos: 01, 02, 03 e 04 a 14 (adicionais).
export const CATEGORIAS_FOTO = [
  { id: 'maquina', numero: '01', rotulo: 'Foto da máquina/equipamento', obrigatoria: true, limite: 1 },
  { id: 'valor', numero: '02', rotulo: 'Foto do valor medido', obrigatoria: true, limite: 1 },
  { id: 'prancheta', numero: '03', rotulo: 'Foto da prancheta', obrigatoria: false, limite: 1 },
  { id: 'adicional', numero: '04', rotulo: 'Fotos adicionais', obrigatoria: false, limite: 11 },
];

// Valor predefinido do campo "Resistência do prolongador" (obrigatório).
export const PROLONGADOR_PADRAO = '0,8';

// Converte o texto do valor medido em número. Vírgula é o separador decimal
// (pt-BR); pontos são tratados como separador de milhar. Ignora unidades/texto.
export function numeroDoValor(texto) {
  if (texto === null || texto === undefined) return NaN;
  let s = String(texto).replace(/[^\d.,-]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  return parseFloat(s);
}

// Regra de conformidade do valor medido: acima de 1000 é "NÃO CONFORME".
export function conformidadeDoValor(valorMedido) {
  if (!String(valorMedido ?? '').trim()) return null;
  return numeroDoValor(valorMedido) > 1000 ? 'NÃO CONFORME' : 'CONFORME';
}

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

export async function renomearCliente(id, nome) {
  return db.clientes.update(Number(id), { nome: nome.trim() });
}

/* ---------------- Setores ---------------- */

export async function listarSetores(clienteId) {
  const setores = await db.setores.where('clienteId').equals(Number(clienteId)).toArray();
  return setores.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function obterSetor(id) {
  if (!id) return null;
  return db.setores.get(Number(id));
}

// Cria o setor (ou devolve o existente com o mesmo nome no cliente).
export async function criarSetor(clienteId, nome) {
  const nomeLimpo = nome.trim();
  const existente = (await listarSetores(clienteId)).find(
    (setor) => setor.nome.toLowerCase() === nomeLimpo.toLowerCase()
  );
  if (existente) return existente.id;
  return db.setores.add({ clienteId: Number(clienteId), nome: nomeLimpo, criadoEm: Date.now() });
}

export async function renomearSetor(id, nome) {
  return db.setores.update(Number(id), { nome: nome.trim() });
}

// Exclui o setor e, em cascata, suas máquinas/equipamentos e todos os
// registros, fotos e áudios delas (em qualquer inspeção).
export async function excluirSetor(id) {
  const setorId = Number(id);
  const equipamentos = await db.equipamentos.where('setorId').equals(setorId).toArray();
  for (const equipamento of equipamentos) {
    await excluirEquipamento(equipamento.id);
  }
  await db.setores.delete(setorId);
}

/* ---------------- Máquinas/Equipamentos ---------------- */

export async function listarEquipamentosDoSetor(setorId) {
  const equipamentos = await db.equipamentos.where('setorId').equals(Number(setorId)).toArray();
  return equipamentos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { numeric: true }));
}

export async function obterEquipamento(id) {
  return db.equipamentos.get(Number(id));
}

// Cria a máquina/equipamento no setor, precedendo o nome com a numeração
// sequencial (mínimo dois dígitos): "01 - Nome". A sequência é única por
// inspeção e NÃO reinicia ao trocar de setor: se a inspeção já tem 01 e 02
// num setor, a próxima máquina, em qualquer setor, recebe 03. As máquinas já
// existentes no setor também entram no cálculo, para evitar números repetidos.
export async function criarEquipamento(clienteId, setorId, nome, inspecaoId) {
  const candidatas = [
    ...(inspecaoId ? await equipamentosDaInspecao(inspecaoId) : []),
    ...(await db.equipamentos.where('setorId').equals(Number(setorId)).toArray()),
  ];
  let maior = 0;
  for (const equipamento of candidatas) {
    const prefixo = equipamento.nome.match(/^(\d{2,})/);
    if (prefixo) maior = Math.max(maior, Number(prefixo[1]));
  }
  const numero = String(maior + 1).padStart(2, '0');
  // Primeira letra sempre maiúscula, mesmo que o usuário digite em minúsculo.
  const nomeLimpo = nome.trim();
  const nomeFormatado = nomeLimpo.charAt(0).toUpperCase() + nomeLimpo.slice(1);
  return db.equipamentos.add({
    clienteId: Number(clienteId),
    setorId: Number(setorId),
    nome: `${numero} - ${nomeFormatado}`,
    criadoEm: Date.now(),
  });
}

// Separa o nome da máquina no prefixo numérico ("01") e na parte descritiva.
export function separarNomeEquipamento(nome) {
  const combinacao = String(nome).match(/^(\d{2,})\s*-\s*(.*)$/);
  return combinacao
    ? { prefixo: combinacao[1], descricao: combinacao[2] }
    : { prefixo: '', descricao: String(nome) };
}

// Renomeia a parte descritiva, mantendo o prefixo numérico e a inicial maiúscula.
export async function renomearEquipamento(id, novaDescricao) {
  const equipamento = await db.equipamentos.get(Number(id));
  if (!equipamento) return;
  const { prefixo } = separarNomeEquipamento(equipamento.nome);
  const limpo = novaDescricao.trim();
  const formatado = limpo.charAt(0).toUpperCase() + limpo.slice(1);
  const nome = prefixo ? `${prefixo} - ${formatado}` : formatado;
  return db.equipamentos.update(Number(id), { nome });
}

// Exclui a máquina/equipamento e, em cascata, seus registros, fotos e áudios.
export async function excluirEquipamento(id) {
  const equipamentoId = Number(id);
  await db.transaction('rw', db.equipamentos, db.registros, db.fotos, db.audios, async () => {
    await db.registros.where('equipamentoId').equals(equipamentoId).delete();
    await db.fotos.where('equipamentoId').equals(equipamentoId).delete();
    await db.audios.where('equipamentoId').equals(equipamentoId).delete();
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
    prolongador: PROLONGADOR_PADRAO, // resistência do prolongador (valor predefinido)
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

// Resumo do registro: { completo, pendentes } com base nos itens obrigatórios
// (fotos 01 e 02, valor medido e resistência do prolongador).
export async function resumoDoEquipamento(inspecaoId, equipamentoId) {
  const fotos = await listarFotos(inspecaoId, equipamentoId);
  const pendentes = CATEGORIAS_FOTO.filter(
    (categoria) => categoria.obrigatoria && !fotos.some((f) => f.categoria === categoria.id)
  ).map((categoria) => categoria.rotulo);
  const registro = await obterRegistro(inspecaoId, equipamentoId);
  if (!registro?.valorMedido?.trim()) pendentes.push('Valor medido');
  if (!registro?.prolongador?.trim()) pendentes.push('Resistência do prolongador');
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
