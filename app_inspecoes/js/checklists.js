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
    // Checklist oficial Nord Consult (documento 'Check-list painéis
    // elétricos'), importado em 2026-07-16. Aplicado POR PAINEL.
    secoes: [
      {
        titulo: 'Verificações do painel',
        itens: [
          { id: 'pan-001', texto: 'Painel possui nomenclatura?' },
          { id: 'pan-002', texto: 'Painel possui sinalização de perigo?' },
          { id: 'pan-003', texto: 'Painel possui sinalização de restrição de acesso?' },
          { id: 'pan-004', texto: 'Painel possui sistema de bloqueio para impedimento de reenergização?' },
          { id: 'pan-005', texto: 'Painel possui aterramento e está com carcaça e portas aterradas?' },
          { id: 'pan-006', texto: 'Painel possui diagrama unifilar?' },
          { id: 'pan-007', texto: 'Painel não apresenta partes vivas expostas?' },
          { id: 'pan-008', texto: 'Painel possui DR?' },
          { id: 'pan-009', texto: 'DR é compatível com o disjuntor a montante?' },
          { id: 'pan-010', texto: 'Painel possui um disjuntor geral?' },
          { id: 'pan-011', texto: 'Painel está limpo e organizado?' },
          { id: 'pan-012', texto: 'Sistema de iluminação existe e está operando?' },
          { id: 'pan-013', texto: 'Sistema de ventilação forçada existe e está operando ou com condições de operação?' },
          { id: 'pan-014', texto: 'Componentes internos estão identificados?' },
          { id: 'pan-015', texto: 'Iluminação da sala de painéis é adequada?' },
          { id: 'pan-016', texto: 'Ergonomia e espaço de trabalho junto ao painel é adequada?' },
        ],
      },
    ],
  },
  documental: {
    rotulo: 'Documental',
    // Auditoria documental do Prontuário de Instalações Elétricas (PIE).
    // Unificação de dois checklists Nord Consult (Word + planilha),
    // importada em 2026-07-22: itens exclusivos de cada lista + um item
    // consolidado por tema repetido. Itens que dependiam de documentos/
    // padrões internos de outra empresa (SRH-190, SRH-009, MAN-1145,
    // "selo padrão Aurora", "cadeado padrão preto") foram omitidos; a
    // verificação genérica equivalente foi mantida quando existia.
    secoes: [
      {
        titulo: 'Diagramas Unifilares',
        itens: [
          { id: 'doc-001', texto: 'Os diagramas unifilares das instalações elétricas de média tensão (MT) existem?' },
          { id: 'doc-002', texto: 'Os diagramas unifilares das instalações elétricas de baixa tensão (BT) existem?' },
          { id: 'doc-003', texto: 'Os diagramas unifilares de média tensão (MT) estão atualizados?' },
          { id: 'doc-004', texto: 'Os diagramas unifilares de baixa tensão (BT) estão atualizados?' },
          { id: 'doc-005', texto: 'Existe uma sistemática de controle da atualização periódica dos diagramas unifilares?' },
        ],
      },
      {
        titulo: 'Projetos Elétricos e Preventivos',
        itens: [
          { id: 'doc-006', texto: 'Todas as edificações possuem projeto ELÉTRICO composto, no mínimo, por pranchas, memorial descritivo e ART devidamente assinados?' },
          { id: 'doc-007', texto: 'As edificações, quando aplicável, possuem projeto de PROTEÇÃO CONTRA DESCARGAS ATMOSFÉRICAS (SPDA) com pranchas, memorial descritivo e ART assinados?' },
          { id: 'doc-008', texto: 'As edificações, quando aplicável, possuem projeto de DETECÇÃO E ALARME DE INCÊNDIO com pranchas, memorial descritivo e ART assinados?' },
          { id: 'doc-009', texto: 'As edificações, quando aplicável, possuem projeto de ILUMINAÇÃO DE EMERGÊNCIA com pranchas, memorial descritivo e ART assinados?' },
          { id: 'doc-010', texto: 'As cópias dos projetos (elétrico, SPDA, alarme/detecção de incêndio e iluminação de emergência) estão disponíveis e de fácil acesso aos trabalhadores autorizados?' },
          { id: 'doc-011', texto: 'Edificações novas ou que sofreram alteração/ampliação considerável tiveram os projetos elétricos e preventivos elaborados ou adequados?' },
        ],
      },
      {
        titulo: 'SPDA e Aterramento',
        itens: [
          { id: 'doc-012', texto: 'A inspeção visual do SPDA (todas as edificações) por equipe própria foi realizada dentro dos últimos 6 meses?' },
          { id: 'doc-013', texto: 'A inspeção do SPDA por empresa/profissional habilitado foi realizada dentro dos últimos 3 anos?' },
          { id: 'doc-014', texto: 'A medição da resistência da malha de aterramento do SPDA foi realizada dentro dos últimos 12 meses?' },
          { id: 'doc-015', texto: 'A medição da continuidade do aterramento de máquinas, painéis e equipamentos foi realizada nos últimos 12 meses (ou quando houve alteração de layout)?' },
          { id: 'doc-016', texto: 'Os resultados das inspeções/medições do SPDA e do aterramento, e o plano de ações (se houver), estão arquivados no PIE?' },
          { id: 'doc-017', texto: 'Existe procedimento definido para a realização periódica das inspeções e medições do SPDA e do aterramento?' },
          { id: 'doc-018', texto: 'Todas as não conformidades registradas na última inspeção do SPDA foram solucionadas?' },
          { id: 'doc-019', texto: 'Houve ocorrência de descarga atmosférica nas edificações desde a última inspeção?' },
          { id: 'doc-020', texto: 'Caso positivo, foi refeita a inspeção visual e a medição da resistência da malha de aterramento?' },
        ],
      },
      {
        titulo: 'Inspeção de Subestações e Painéis',
        itens: [
          { id: 'doc-021', texto: 'As inspeções visuais das subestações foram realizadas dentro dos últimos 6 meses?' },
          { id: 'doc-022', texto: 'As inspeções termográficas das subestações e painéis foram realizadas dentro dos últimos 12 meses?' },
          { id: 'doc-023', texto: 'Os ensaios de isolação elétrica dos componentes das subestações foram realizados dentro dos últimos 2 anos?' },
          { id: 'doc-024', texto: 'As análises físico-químicas e cromatográficas do óleo dos transformadores foram realizadas nos últimos 12 meses?' },
          { id: 'doc-025', texto: 'Existe comprovação das inspeções periódicas nas subestações e nas salas de painéis/painéis?' },
          { id: 'doc-026', texto: 'Os resultados dessas inspeções (termografia, óleo, etc.) e os planos de ação (se houver) estão arquivados no PIE?' },
          { id: 'doc-027', texto: 'Todas as não conformidades registradas nas últimas inspeções de subestações foram resolvidas?' },
          { id: 'doc-028', texto: 'Foi registrado algum evento anormal nas subestações entre a última inspeção e a data atual?' },
          { id: 'doc-029', texto: 'Caso positivo, foi refeita a inspeção visual e funcional dos componentes da subestação que registrou a anormalidade?' },
        ],
      },
      {
        titulo: 'Procedimentos Técnicos',
        itens: [
          { id: 'doc-030', texto: 'Existem procedimentos e instruções técnicas detalhadas (passo a passo) para a execução com segurança dos serviços elétricos, especialmente os mais comuns e de maior risco?' },
          { id: 'doc-031', texto: 'Existem procedimentos/instruções técnicas para inspeção de subestações?' },
          { id: 'doc-032', texto: 'Existem procedimentos/instruções técnicas para inspeção de painéis de baixa tensão?' },
          { id: 'doc-033', texto: 'Existem procedimentos/instruções técnicas para manutenção de subestações?' },
          { id: 'doc-034', texto: 'Existem procedimentos/instruções técnicas para manutenção de painéis de baixa tensão?' },
          { id: 'doc-035', texto: 'Existem procedimentos/instruções técnicas para operação de subestações?' },
          { id: 'doc-036', texto: 'Existem procedimentos/instruções técnicas para operação de painéis de baixa tensão?' },
          { id: 'doc-037', texto: 'Os procedimentos técnicos foram elaborados por profissional legalmente habilitado, com ART correspondente?' },
          { id: 'doc-038', texto: 'Os procedimentos e instruções estão disponíveis e de fácil acesso aos profissionais autorizados?' },
          { id: 'doc-039', texto: 'Existe comprovação de que todos os profissionais autorizados foram treinados nos procedimentos existentes?' },
          { id: 'doc-040', texto: 'Quando há inovações tecnológicas ou alterações no sistema elétrico (MT/BT), os procedimentos são revisados e readequados?' },
          { id: 'doc-041', texto: 'Desde a última auditoria, surgiram novas atividades corriqueiras que necessitem de procedimento específico a ser criado?' },
          { id: 'doc-042', texto: 'Os profissionais incluídos/substituídos desde a última auditoria foram treinados nos procedimentos técnicos existentes, com evidência do treinamento?' },
        ],
      },
      {
        titulo: 'Procedimentos de Emergência',
        itens: [
          { id: 'doc-043', texto: 'Existem no PIE procedimentos emergenciais para os acidentes mais comuns com eletricidade (choque elétrico, queda de altura, queimaduras e animais peçonhentos)?' },
          { id: 'doc-044', texto: 'A empresa possui métodos de resgate padronizados e disponibiliza os meios para sua aplicação?' },
          { id: 'doc-045', texto: 'Os trabalhadores autorizados estão aptos a realizar resgate e prestar primeiros socorros?' },
          { id: 'doc-046', texto: 'Existe comprovação de que todos os eletricistas foram treinados nos procedimentos de emergência existentes?' },
          { id: 'doc-047', texto: 'Desde a última auditoria surgiram novas condições de risco que impliquem novo procedimento de emergência ou revisão dos existentes?' },
          { id: 'doc-048', texto: 'Os profissionais incluídos/substituídos desde a última auditoria foram treinados nos procedimentos de emergência, com evidência do treinamento?' },
        ],
      },
      {
        titulo: 'Mapa de Riscos e Zonas de Risco',
        itens: [
          { id: 'doc-049', texto: 'Existe mapa de risco identificando e delimitando as áreas com restrição de acesso por risco de choque elétrico (zonas de risco e controlada)?' },
          { id: 'doc-050', texto: 'Todas as áreas constantes no mapa de risco possuem placas de advertência conforme o mapa?' },
          { id: 'doc-051', texto: 'Há comprovação de que todos os funcionários (leigos e não leigos) receberam treinamento sobre a localização e o perigo das áreas de risco/controladas?' },
          { id: 'doc-052', texto: 'Houve alteração/inclusão nas instalações de MT/BT que implique atualização do mapa de risco existente?' },
        ],
      },
      {
        titulo: 'EPIs, EPCs e Ferramentais',
        itens: [
          { id: 'doc-053', texto: 'Existe definição/lista dos EPIs, EPCs e ferramentais de uso obrigatório, por atividade/tarefa, para serviços em eletricidade?' },
          { id: 'doc-054', texto: 'Existem equipamentos adequados para o trabalho nas tensões existentes nas instalações elétricas?' },
          { id: 'doc-055', texto: 'Todos os EPIs e EPCs possuem Certificado de Aprovação (CA) emitido pelo órgão competente?' },
          { id: 'doc-056', texto: 'Todos os eletricistas possuem kit de bloqueio e sinalização para equipamentos desenergizados?' },
          { id: 'doc-057', texto: 'As vestimentas dos trabalhadores autorizados são adequadas quanto à condutibilidade, inflamabilidade e influências eletromagnéticas?' },
          { id: 'doc-058', texto: 'Existe memória de cálculo definindo se a vestimenta está adequada à energia de curto-circuito máxima da instalação (índice ATPV)?' },
          { id: 'doc-059', texto: 'Existe comprovação de que os eletricistas conhecem a obrigatoriedade da lista de EPIs/EPCs e foram treinados no uso correto?' },
          { id: 'doc-060', texto: 'Existe ficha/sistema de controle de entrega e devolução de EPIs e EPCs?' },
          { id: 'doc-061', texto: 'Existe sistema de controle dos ensaios de isolação elétrica (e de sua validade) para EPIs, EPCs e ferramentais isolados?' },
          { id: 'doc-062', texto: 'Os ensaios de isolação elétrica dos EPIs, EPCs e ferramentais isolados estão dentro do prazo de validade?' },
          { id: 'doc-063', texto: 'Existe sistemática de descarte dos ferramentais, EPCs e EPIs reprovados nos ensaios?' },
          { id: 'doc-064', texto: 'Os resultados dos ensaios de isolação estão arquivados no PIE?' },
          { id: 'doc-065', texto: 'Desde a última auditoria surgiram novas atividades que necessitem inclusão na lista de EPIs/EPCs?' },
          { id: 'doc-066', texto: 'A documentação de controle de EPIs/EPCs e dos ensaios está no PIE ou há indicação precisa do setor/responsável, com acesso aos órgãos fiscalizadores e à equipe?' },
        ],
      },
      {
        titulo: 'Organização do Trabalho e Segurança',
        itens: [
          { id: 'doc-067', texto: 'Existe procedimento de análise de risco (APR) executado pelos trabalhadores autorizados antes da execução de uma tarefa?' },
          { id: 'doc-068', texto: 'Antes do início das atividades é realizado o diálogo preliminar de segurança em conjunto com o superior responsável?' },
          { id: 'doc-069', texto: 'Os trabalhos com instalações energizadas têm um responsável formalmente definido pela atividade?' },
          { id: 'doc-070', texto: 'Dentro da equipe de serviço há um supervisor definido?' },
          { id: 'doc-071', texto: 'Os trabalhadores que executam serviços em área de risco/controlada em AT energizada trabalham em dupla?' },
          { id: 'doc-072', texto: 'Existe sistema que permita a comunicação permanente entre a equipe e o superior, e entre as equipes envolvidas na atividade?' },
          { id: 'doc-073', texto: 'Os trabalhadores que executam serviços em área de risco/controlada em AT energizada possuem ordem de serviço específica?' },
          { id: 'doc-074', texto: 'É garantida a proibição do uso de adornos pessoais pelos que trabalham com eletricidade?' },
          { id: 'doc-075', texto: 'Os trabalhadores estão cientes do direito de recusa e existe procedimento de como tratá-lo?' },
          { id: 'doc-076', texto: 'Existe treinamento e procedimento de permissão para serviços em locais sujeitos à explosão (áreas classificadas)?' },
          { id: 'doc-077', texto: 'Existe procedimento na contratação de terceiros para garantir o atendimento à NR-10?' },
          { id: 'doc-078', texto: 'Os equipamentos elétricos que não podem ser desligados em caso de incêndio estão sinalizados?' },
          { id: 'doc-079', texto: 'As medidas de controle dos serviços em eletricidade estão integradas às demais medidas de segurança da empresa?' },
        ],
      },
      {
        titulo: 'Documentações Comprobatórias e Autorização',
        itens: [
          { id: 'doc-080', texto: 'Todos os eletricistas possuem certificado de capacitação na área elétrica reconhecido pelo sistema nacional de ensino?' },
          { id: 'doc-081', texto: 'Todos os trabalhadores autorizados possuem certificado de NR-10 básica (ou reciclagem) dentro da validade (inferior a 2 anos)?' },
          { id: 'doc-082', texto: 'Há no mínimo dois eletricistas, em todos os horários de funcionamento, com NR-10 complementar (SEP) ou reciclagem dentro da validade (inferior a 2 anos)?' },
          { id: 'doc-083', texto: 'Os eletricistas incluídos/substituídos desde a última auditoria possuem capacitação na área elétrica e NR-10 (básica e, se aplicável, SEP) dentro da validade?' },
          { id: 'doc-084', texto: 'Algum funcionário permaneceu afastado/inativo por mais de três meses e, em caso positivo, realizou a reciclagem de NR-10 (básica e, se aplicável, SEP)?' },
          { id: 'doc-085', texto: 'Todos os eletricistas possuem carta de autorização formal da empresa para exercer serviços em eletricidade?' },
          { id: 'doc-086', texto: 'Existe um sistema formal de identificação dos funcionários autorizados a trabalhar com eletricidade?' },
          { id: 'doc-087', texto: 'Existem documentações que comprovem que todos os profissionais que trabalham com eletricidade são autorizados?' },
          { id: 'doc-088', texto: 'Existem ordens de serviço (NR-01) para os profissionais que trabalham com eletricidade?' },
          { id: 'doc-089', texto: 'Os trabalhadores realizam exames periódicos de saúde compatíveis com as atividades que exercem?' },
          { id: 'doc-090', texto: 'A documentação (certificados, autorizações, etc.) está no PIE ou há indicação precisa do setor/responsável, com acesso aos órgãos fiscalizadores e à equipe técnica?' },
          { id: 'doc-091', texto: 'Existe documento formal designando um responsável por manter o PIE organizado, mantido e atualizado?' },
        ],
      },
      {
        titulo: 'Normas Regulamentadoras e Auditoria do PIE',
        itens: [
          { id: 'doc-092', texto: 'Existe cópia atualizada da NR-10 (Segurança em Instalações e Serviços em Eletricidade)?' },
          { id: 'doc-093', texto: 'Caso a NR-10 tenha sido alterada desde a última auditoria, o prontuário está de acordo com essas alterações?' },
          { id: 'doc-094', texto: 'As demais normas contidas no prontuário estão atualizadas?' },
          { id: 'doc-095', texto: 'Existe uma sistemática de auditoria do PIE e a última auditoria foi realizada há menos de um ano?' },
        ],
      },
    ],
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
