/* =============================================================================
   testes/verificar.mjs — suíte de verificação do gerador de planilha.

   Rode com:   node testes/verificar.mjs
   Não precisa de npm install: usa o JSZip vendorizado do próprio aplicativo.

   ESTES TESTES EXISTEM POR UM MOTIVO ESPECÍFICO.
   As três formas de quebrar esta planilha NÃO produzem erro nenhum: produzem um
   arquivo que abre bem, calcula, e está errado. Se algum destes testes falhar,
   NÃO entregue a planilha ao cliente.
   ========================================================================== */

import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => path.join(RAIZ, ...s);

/* -- carrega o código do app num contexto isolado, como o navegador faria -- */
const ctx = {
  console, Math, JSON, Object, Array, Set, Map, String, Number, Error,
  Promise, Uint8Array, ArrayBuffer, Date, setTimeout, Buffer, RegExp, Symbol,
  Blob,   // o gerador devolve Blob, como no navegador
};
ctx.globalThis = ctx; ctx.window = ctx; ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(p('vendor', 'jszip.min.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(p('src', 'planilha.js'), 'utf8'), ctx);

const MODELO = fs.readFileSync(p('docs', 'modelo-original.xlsx'));
const CLIENTE = { nome: 'Aurora Alimentos', cidade: 'Chapecó', estado: 'SC' };
const carregarFixture = n => JSON.parse(fs.readFileSync(p('testes', 'fixtures', n), 'utf8'));

/* ------------------------------------------------------------- mini runner */
let passou = 0, falhou = 0;
const testes = [];
const teste = (nome, fn) => testes.push({ nome, fn });
function conferir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

/* =========================== TESTES ======================================= */

teste('gera a planilha com o número certo de painéis', async () => {
  const r = await ctx.gerarPlanilha({
    modeloBytes: MODELO, dados: carregarFixture('dados-gelnex.json'),
    cliente: CLIENTE, logoBytes: null,
  });
  conferir(r.totalPaineis === 123,
    `esperado 123 painéis, veio ${r.totalPaineis}`);
  return r;
});

teste('ARMADILHA 1 — respostas gravadas como glifo Wingdings 2, não como texto',
  async () => {
    // Escrever "Não" não dá erro: as fórmulas comparam contra $W$3/$W$4,
    // nunca casam, e TODO painel marca 100%.
    const xml = await xmlDaAba('xl/worksheets/sheet1.xml');
    const naoConformes = (xml.match(/<is><t[^>]*>=<\/t><\/is>/g) || []).length;
    const conformes = (xml.match(/<is><t[^>]*>&lt;<\/t><\/is>/g) || []).length;
    conferir(conformes > 0, 'nenhum glifo de "conforme" (<) na planilha');
    conferir(naoConformes > 0, 'nenhum glifo de "não conforme" (=) na planilha');
    conferir(!/<is><t[^>]*>(Sim|Não|N\/A)<\/t><\/is>/.test(xml),
      'há resposta gravada como TEXTO em vez de glifo');
  });

teste('ARMADILHA 2 — item sem resposta vira NA, nunca célula em branco', async () => {
  // Em branco o item entra inteiro no ranking pontuando cheio:
  // item que ninguém inspecionou vira item aprovado.
  const dados = carregarFixture('dados-gelnex.json');
  const { linhas } = ctx.montarLinhas(ctx.interpretarDados(dados));
  const colunas = 'FGHIJKLMNOPQRS'.split('');
  for (const linha of linhas) {
    for (const col of colunas) {
      const v = linha.valores[col];
      conferir(v === '<' || v === '=' || v === '\u0098',
        `coluna ${col} com valor inesperado: ${JSON.stringify(v)}`);
    }
  }
  const comAviso = linhas.filter(l => /NAO inspecionado/.test(l.textoOutras || ''));
  conferir(comAviso.length > 0,
    'nenhum aviso de item não inspecionado — a fixture tem 50 itens sem resposta');
});

teste('ARMADILHA 3 — arquivo marcado para recalcular ao abrir', async () => {
  // O modelo guarda valores em cache (T6 vem com <v>1</v> = 100%). Sem isto o
  // Excel mostra 100% em todos os painéis até alguém apertar Ctrl+Alt+F9.
  const wbx = await xmlDaAba('xl/workbook.xml');
  conferir(/fullCalcOnLoad="1"/.test(wbx), 'falta fullCalcOnLoad no workbook.xml');
});

teste('formatação condicional preservada (openpyxl e ExcelJS destroem)', async () => {
  const orig = await xmlOriginal('xl/worksheets/sheet1.xml');
  const saida = await xmlDaAba('xl/worksheets/sheet1.xml');
  const contar = (x, rx) => (x.match(rx) || []).length;
  for (const [nome, rx] of [
    ['x14:conditionalFormatting', /<x14:conditionalFormatting[ >]/g],
    ['x14:cfRule', /<x14:cfRule/g],
    ['conditionalFormatting', /<conditionalFormatting /g],
    ['dataValidation', /<dataValidation /g],
    ['mergeCell', /<mergeCell /g],
  ]) {
    conferir(contar(orig, rx) === contar(saida, rx),
      `${nome}: modelo tem ${contar(orig, rx)}, saída tem ${contar(saida, rx)}`);
  }
});

teste('imagens preservadas (só a logo do cliente pode mudar)', async () => {
  const zip = await ctx.JSZip.loadAsync(ultimaSaida);
  for (const nome of ['xl/media/image1.png', 'xl/media/image2.png', 'xl/media/image3.jpeg'])
    conferir(zip.file(nome) !== null, `faltou ${nome}`);
});

teste('fórmulas compartilhadas sem órfãos', async () => {
  // Limpar a linha que contém o "mestre" de uma fórmula compartilhada deixa as
  // dependentes sem definição. Há mestres nas linhas 133, 197, 261 e 325.
  const xml = await xmlDaAba('xl/worksheets/sheet2.xml');
  const mestres = new Set([...xml.matchAll(/<f t="shared" ref="[^"]+" si="(\d+)"/g)].map(m => m[1]));
  const usados = new Set([...xml.matchAll(/<f t="shared"[^>]*si="(\d+)"/g)].map(m => m[1]));
  const orfaos = [...usados].filter(si => !mestres.has(si));
  conferir(orfaos.length === 0, `fórmulas órfãs: ${orfaos.join(', ')}`);
});

teste('painel sem nenhuma resposta não recebe ranking', async () => {
  // Todos NA => denominador zero => #DIV/0! em cascata (o modelo não tem guarda).
  const { linhas } = ctx.montarLinhas(ctx.interpretarDados(carregarFixture('dados-gelnex.json')));
  const semRanking = linhas.filter(l => l.semRanking);
  conferir(semRanking.length === 2,
    `esperados 2 painéis não inspecionados, achei ${semRanking.length}`);
  for (const l of semRanking)
    conferir(/PAINEL NAO INSPECIONADO/.test(l.textoOutras), 'falta o aviso na coluna U');
});

teste('linhas fantasma do modelo são limpas', async () => {
  const xml = await xmlDaAba('xl/worksheets/sheet1.xml');
  const linha = /<row r="129"[\s\S]*?<\/row>/.exec(xml)[0];
  conferir(!/<is>/.test(linha), 'a linha 129 deveria estar vazia');
});

teste('pacote dividido: detecta as partes pelo nome', async () => {
  const a = ctx.detectarParte('Inspecao_parte1de2.zip', '', '');
  const b = ctx.detectarParte('x.zip', 'Inspecao_NR10_GelnexPY_2026-08-03_parte2de2', '');
  const c = ctx.detectarParte('qualquer.zip', 'PastaSemParte', '');
  conferir(a.numero === 1 && a.total === 2, 'não detectou parte 1 de 2 pelo arquivo');
  conferir(b.numero === 2 && b.total === 2, 'não detectou parte 2 de 2 pela pasta');
  conferir(c.total === 1, 'pacote único deveria ser 1 de 1');
});

teste('pacote dividido: mesclagem reconstrói a inspeção inteira', async () => {
  const partes = [
    { parte: { numero: 2, de: 2, total: 2 }, dados: carregarFixture('parte2de2.json') },
    { parte: { numero: 1, de: 2, total: 2 }, dados: carregarFixture('parte1de2.json') },
  ]; // de propósito fora de ordem
  const { dados, conflitos } = ctx.mesclarPartes(partes);
  conferir(conflitos.length === 0, `conflitos inesperados: ${conflitos.join(' | ')}`);
  const { paineis } = ctx.interpretarDados(dados);
  conferir(paineis.length === 123, `esperados 123 painéis, veio ${paineis.length}`);
});

teste('pacote dividido: recusa parte de outra inspeção', async () => {
  const p1 = carregarFixture('parte1de2.json');
  const p2 = JSON.parse(JSON.stringify(carregarFixture('parte2de2.json')));
  p2.cliente = { nome: 'Outro Cliente' };
  const { conflitos } = ctx.mesclarPartes([
    { parte: { numero: 1, total: 2 }, dados: p1 },
    { parte: { numero: 2, total: 2 }, dados: p2 },
  ]);
  conferir(conflitos.length > 0, 'deveria recusar parte de outra inspeção');
});

/* ----------------------------------------------------------------- apoio */
let ultimaSaida = null;
async function xmlDaAba(caminho) {
  const zip = await ctx.JSZip.loadAsync(ultimaSaida);
  return zip.file(caminho).async('string');
}
async function xmlOriginal(caminho) {
  const zip = await ctx.JSZip.loadAsync(MODELO);
  return zip.file(caminho).async('string');
}

/* ------------------------------------------------------------------ run */
console.log('\n  Verificação do gerador de planilha\n  ' + '─'.repeat(52));
const r0 = await ctx.gerarPlanilha({
  modeloBytes: MODELO, dados: carregarFixture('dados-gelnex.json'),
  cliente: CLIENTE, logoBytes: null,
});
ultimaSaida = Buffer.from(await r0.blob.arrayBuffer());

for (const t of testes) {
  try {
    await t.fn();
    console.log('  \u001b[32m✓\u001b[0m ' + t.nome);
    passou++;
  } catch (e) {
    console.log('  \u001b[31m✗\u001b[0m ' + t.nome + '\n      ' + e.message);
    falhou++;
  }
}
console.log('  ' + '─'.repeat(52));
console.log(`  ${passou} passou, ${falhou} falhou\n`);
if (falhou) process.exit(1);
