// checklists.js — itens de verificação dos tipos com checklist.
// AGUARDANDO as listas oficiais da Nord Consult: enquanto um tipo tiver
// as seções vazias, ele aparece como "Aguardando checklist" e não pode
// ser iniciado. Para ativar, preencha as seções e itens no formato:
//
//   secoes: [
//     {
//       titulo: 'Aterramento',
//       itens: [
//         { id: 'sub-001', texto: 'Malha de aterramento íntegra e conectada' },
//         { id: 'sub-002', texto: 'Conexões de aterramento sem corrosão' },
//       ],
//     },
//   ]
//
// REGRAS DOS IDs: únicos no app inteiro, curtos e ESTÁVEIS — nunca
// reaproveite um id antigo para um item novo (as respostas salvas nos
// celulares apontam para esses ids).

export const CHECKLISTS = {
  subestacoes: {
    rotulo: 'Subestações',
    secoes: [],
  },
  paineis: {
    rotulo: 'Painéis',
    secoes: [],
  },
  documental: {
    rotulo: 'Documental',
    secoes: [],
  },
};

export function checklistDoTipo(tipo) {
  return CHECKLISTS[tipo] || null;
}

/** Um tipo só fica disponível quando tem ao menos um item de checklist. */
export function tipoTemChecklist(tipo) {
  const checklist = CHECKLISTS[tipo];
  return !!checklist && checklist.secoes.some((secao) => secao.itens.length > 0);
}

/** Localiza um item pelo id → { tipo, secao, item } ou null. */
export function itemPorId(itemId) {
  for (const [tipo, checklist] of Object.entries(CHECKLISTS)) {
    for (const secao of checklist.secoes) {
      const item = secao.itens.find((i) => i.id === itemId);
      if (item) return { tipo, secao, item };
    }
  }
  return null;
}

/** Total de itens do checklist de um tipo. */
export function totalItens(tipo) {
  const checklist = CHECKLISTS[tipo];
  if (!checklist) return 0;
  return checklist.secoes.reduce((soma, secao) => soma + secao.itens.length, 0);
}
