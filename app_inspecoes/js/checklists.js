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
    // Checklist oficial Nord Consult (planilha 'Checklist inspeção de
    // subestações', aba P1 - V&F), importado em 2026-07-16.
    secoes: [
      {
        titulo: 'Geral',
        itens: [
          { id: 'sub-001', texto: 'Extintor existe e está dentro do prazo de validade?' },
          { id: 'sub-002', texto: 'Sinalizações são existentes ("Perigo de morte" e "Acesso permitido somente a pessoas autorizadas")?' },
          { id: 'sub-003', texto: 'Para-raios externos não estão atuados?' },
          { id: 'sub-004', texto: 'Portões e portas permanecem trancados evitando acesso de leigos ao interior da mesma?' },
          { id: 'sub-005', texto: 'Porta abre para fora?' },
          { id: 'sub-006', texto: 'Largura da porta é superior a 1,2m?' },
          { id: 'sub-007', texto: 'Existe tela de proteção nas janelas? (malha mínima de 5mm e máxima 13mm)' },
          { id: 'sub-008', texto: 'Ausência de ruído excessivo ou estranho?' },
          { id: 'sub-009', texto: 'EPIs e EPCs estão disponíveis e com os testes de validade em dia (tapetes, varas de manobra, luvas)?' },
          { id: 'sub-010', texto: 'Existe diagrama unifilar no interior da subestação?' },
          { id: 'sub-011', texto: 'Iluminação de emergência funciona?' },
          { id: 'sub-012', texto: 'Iluminação é adequada e funciona?' },
          { id: 'sub-013', texto: 'Lacres de dispositivos de medição e selos de concessionária, quando aplicável, estão intactos?' },
          { id: 'sub-014', texto: 'O ambiente está limpo, sem acúmulo de poeira condutiva, óleo, resíduos ou materiais estranhos?' },
          { id: 'sub-015', texto: 'O ambiente não apresenta materiais depositados em seu interior?' },
          { id: 'sub-016', texto: 'Sistema de ventilação da subestação funciona?' },
          { id: 'sub-017', texto: 'Todos os painéis estão com a sua carcaça aterrada?' },
          { id: 'sub-018', texto: 'As distâncias mínimas de segurança são respeitadas através de obstáculos? (Parte do corpo ou ferramental pode acessar a zona de risco?)' },
          { id: 'sub-019', texto: 'No caso de SE incorporada ao prédio existem portas corta-fogo?' },
          { id: 'sub-020', texto: 'O piso das áreas de circulação está firme, sem buracos, desníveis perigosos ou poças de água/óleo?' },
          { id: 'sub-021', texto: 'Largura dos corredores é superior a 1,2m?' },
          { id: 'sub-022', texto: 'No caso de ramal de entrada subterrâneo a malha de aterramento do cabo está conectada à terra em uma das extremidades do cabo?' },
          { id: 'sub-023', texto: 'Para-raios internos não estão atuados?' },
        ],
      },
      {
        titulo: 'Disjuntor (PVO)',
        itens: [
          { id: 'sub-024', texto: 'Nível de óleo do disjuntor de MT está adequado (PVO)?' },
        ],
      },
      {
        titulo: 'Disjuntor (SF6)',
        itens: [
          { id: 'sub-025', texto: 'Indicador de nível de gás SF6 indica conformidade?' },
        ],
      },
      {
        titulo: 'Disjuntor (Geral)',
        itens: [
          { id: 'sub-026', texto: 'Os indicadores de posição (aberto/fechado) do disjuntor geral estão claros e coerentes com a condição real?' },
          { id: 'sub-027', texto: 'Sistema de intertravamento das chaves e disjuntores funciona?' },
          { id: 'sub-028', texto: 'Relé de proteção secundária está ligado?' },
        ],
      },
      {
        titulo: 'Proteção secundária',
        itens: [
          { id: 'sub-029', texto: 'No-break do relé de proteção secundária está funcionando?' },
          { id: 'sub-030', texto: 'Valores de corrente, tensão e potência (se aplicável) são condizentes com a carga existente na unidade?' },
          { id: 'sub-031', texto: 'Relé de proteção secundária está com ajustes corretos e foi ensaiado?' },
        ],
      },
      {
        titulo: 'Transformador a óleo',
        itens: [
          { id: 'sub-032', texto: 'Não há vazamentos de óleo em juntas, radiadores, buchas, válvulas ou base?' },
          { id: 'sub-033', texto: 'Nível de óleo no visor (ou conservador) está dentro da faixa para a temperatura ambiente observada?' },
          { id: 'sub-034', texto: 'Radiadores limpos, sem amassados críticos e com ventiladores (se existentes) fixos; não há vibração excessiva?' },
          { id: 'sub-035', texto: 'Sílica gel (desumidificador) está com coloração azul ou laranja (não saturada)?' },
        ],
      },
      {
        titulo: 'Transformador seco',
        itens: [
          { id: 'sub-036', texto: 'Relé de monitoramento da temperatura dos enrolamentos está ligado?' },
          { id: 'sub-037', texto: 'Sistema de ventilação forçada existe e está operando?' },
        ],
      },
      {
        titulo: 'Transformador (Geral)',
        itens: [
          { id: 'sub-038', texto: 'Proteções (relés) do transformador estão conectadas a algum dispositivo de seccionamento/monitoramento?' },
          { id: 'sub-039', texto: 'Buchas sem trincas, sinais de carbonização, trilhas, contaminação ou umidade acumulada?' },
          { id: 'sub-040', texto: 'Bandejamento, leitos e eletrocalhas não apresentam sobrecarga, deformações ou objetos apoiados indevidamente?' },
        ],
      },
      {
        titulo: 'Geral (demais itens)',
        itens: [
          { id: 'sub-041', texto: 'No caso de ramal de saída subterrâneo a malha de aterramento do cabo está conectada à terra em uma das extremidades do cabo?' },
          { id: 'sub-042', texto: 'Tela de proteção interna possui malha nas dimensões adequadas? (máx 30x30mm)' },
          { id: 'sub-043', texto: 'Ausência de furos nas telas internas, externas, em anteparos, portas ou janelas?' },
          { id: 'sub-044', texto: 'As conexões aparentes do sistema de aterramento (barras, condutores, conexões a estruturas) estão firmes, sem corrosão/exsudação?' },
          { id: 'sub-045', texto: 'Demais estruturas metálicas não condutivas estão aterradas?' },
          { id: 'sub-046', texto: 'Não há condutores de terra rompidos, frouxos ou com isolamento danificado?' },
          { id: 'sub-047', texto: 'Visualmente os componentes não apresentam algum ponto que sinalize fuga de energia?' },
          { id: 'sub-048', texto: 'Todos os componentes da instalação estão íntegros e não estão faltando componentes?' },
          { id: 'sub-049', texto: 'Jumpers de continuidade nas portas/portões e cercas (quando exigido) estão presentes?' },
          { id: 'sub-050', texto: 'Ausência de sinais de oxidação, ponto quente, ou mau contato nas conexões?' },
          { id: 'sub-051', texto: 'Visualmente, os principais componentes de AT (barramentos, chaves seccionadoras, fusíveis, disjuntores, cabos, muflas, transformadores, para-raios) estão em bom estado?' },
          { id: 'sub-052', texto: 'Visualmente, os principais componentes de BT (cabos, painéis, barramentos, disjuntores) estão em bom estado?' },
        ],
      },
    ],
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
