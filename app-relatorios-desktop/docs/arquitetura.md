# App Desktop de Relatórios — Documento de Arquitetura

**Versão:** 1.0 — Agosto/2026
**Projeto irmão:** App de Campo (PWA offline-first, em desenvolvimento)
**Escopo inicial:** planilha resumo da **Inspeção de Painéis Elétricos** (modo Checklist)

**Decisões confirmadas:** navegador **Chrome** · operadores: **inspetores + equipe de escritório** · relatório final em **Word e PDF**

---

## 0. Leitura crítica da situação (antes de qualquer código)

Três coisas precisam ser ditas de cara, porque elas mudam a ordem do trabalho:

1. **O contrato (`dados.json`) ainda não existe.** Ele está previsto para a Fase 4 do app de campo. Construir o app desktop antes disso é construir em cima de neblina: o leitor vai ser reescrito quando o esquema real aparecer. **Solução proposta:** este documento já traz uma **proposta fechada de esquema v1.0** (seção 3). Ela vira o contrato agora, os dois projetos implementam contra ela, e ninguém retrabalha.

2. **O modelo da planilha ainda não foi anexado.** Sem ele, qualquer layout que eu inventar vai estar errado. **Solução proposta:** o gerador de planilha **não** desenha o layout no código — ele **preenche o .xlsx da empresa** guiado por um arquivo de mapeamento em JSON (seção 5). Quando o modelo chegar, muda-se configuração, não código.

3. **"App desktop" aqui não precisa significar Electron.** Detalhado na seção 2. Resumo: o princípio herdado é "simplicidade de manutenção acima de tudo", e Electron viola isso de forma bem grosseira para quem não é dev profissional.

---

## 1. Princípios (herdados e não negociáveis)

| Princípio | Consequência prática aqui |
|---|---|
| Simplicidade de manutenção acima de tudo | Sem build step. Sem `npm run build`. Sem pipeline. Editar arquivo → recarregar. |
| Zero backend | Tudo roda na máquina do escritório, lendo pastas locais/rede. |
| Configuração em JSON editável | Checklists **compartilhados** com o app de campo; layout das planilhas também em JSON. |
| pt-BR em tudo | Interface, nomes de campo do JSON, documentos gerados. |
| Fases incrementais testáveis | Cada fase entrega algo que o usuário consegue abrir e conferir. |
| **Novo:** falhar alto, nunca falhar quieto | Esquema desconhecido, mídia faltando, NC órfã → erro visível na tela, jamais planilha errada em silêncio. |

Esse último é meu acréscimo e faço questão dele. O pior desfecho possível deste projeto não é dar erro — é gerar uma planilha bonita, plausível e **errada**, que vai assinada para um cliente de engenharia elétrica sob NR-10.

---

## 2. Stack: decisão e alternativas descartadas

### Escolha: **HTML + JS puro, rodando localmente no Chrome, em modo aplicativo**

Um `index.html`, bibliotecas vendorizadas em `/vendor`, aberto por um atalho `.bat` que dispara o navegador em modo app (sem barra de endereço, ícone próprio, cara de programa instalado):

```bat
@echo off
start chrome --app="file:///C:/AppRelatorios/index.html" --allow-file-access-from-files
```

**Por que essa:**
- Zero instalação, zero build, zero assinatura de código, zero antivírus reclamando.
- Mesma linguagem e mesma cabeça do app de campo — um mantenedor, um modelo mental.
- Atualizar = copiar arquivos na pasta. Reverter = copiar de volta.
- **File System Access API** (Chromium) dá acesso real a pastas: ler milhares de fotos sob demanda e **escrever** de volta na pasta da inspeção. Isso resolve o problema de volume sem carregar GBs na memória.

**Restrição aceita — e já resolvida:** exige Chromium. **Chrome confirmado em todas as máquinas**, então a File System Access API está garantida e o plano B de leitura degradada (`<input webkitdirectory>`) vira apenas rede de segurança, não caminho principal. Firefox e Safari ficam explicitamente fora de suporte, e isso deve constar na tela inicial — se alguém abrir no Firefox, o app avisa em vez de quebrar sozinho.

### Descartadas, com motivo

| Alternativa | Por que não |
|---|---|
| **Electron** | Instalador, code signing, atualizações, ~150MB de runtime, `node_modules` para manter. Um pesadelo de manutenção para um não-dev, em troca de quase nada que o navegador já não faça. |
| **Python + PyInstaller** | `openpyxl`/`python-docx` são ótimos, mas empacotar vira ritual: ambiente, hooks, falso positivo de antivírus, rebuild a cada ajuste. |
| **App web hospedado** | Viola "zero backend" e coloca dados de cliente trafegando à toa. |
| **Macro VBA no Excel** | Rápido de começar, inviável de evoluir para relatórios com foto. Já vi esse filme; termina em arquivo de 4MB que só uma pessoa entende. |

**Ressalva honesta:** se lá na frente (Fase 4) o relatório Word com centenas de fotos embutidas ficar lento no navegador, a saída é um script Python **auxiliar e opcional** só para essa etapa — não uma reescrita. Fica registrado como plano B, não como preocupação de agora.

### Bibliotecas (vendorizadas, nunca CDN)

| Lib | Uso | Observação |
|---|---|---|
| **ExcelJS** | Ler o modelo .xlsx da empresa e preencher preservando formatação | Escolhida em vez do SheetJS community, que perde estilos ao escrever |
| **JSZip** | Abrir pacotes ainda em .zip | Fase 1 usa só `dados.json`, então é barato |
| **docx.js** | Relatórios Word (Fase 4) | Único gerador de documento. O PDF vem dele, não de um segundo motor |
| *(PowerShell + Word COM)* | Conversão .docx → .pdf | Script auxiliar, fora do app. Zero dependências |

CDN está proibido: servidor de escritório pode estar sem internet, e a build de hoje precisa ser idêntica à de daqui a dois anos.

### Relatórios em Word **e** PDF: uma fonte, dois arquivos

Word e PDF confirmados. Mas atenção ao jeito errado de fazer isso, porque é o jeito intuitivo: gerar o `.docx` com uma biblioteca **e** gerar o PDF com outra. São dois motores de renderização diferentes. Eles vão divergir — margem, quebra de página, posição da foto — e um dia o PDF que foi pro cliente não vai bater com o Word que ficou no servidor. Num laudo técnico, isso é o tipo de coisa que aparece justamente na hora ruim.

**Decisão: o `.docx` é a fonte canônica. O PDF é derivado dele, nunca paralelo a ele.**

O app gera o Word. A conversão sai do próprio Word, que já está instalado nas máquinas e é o único renderizador que garante fidelidade 1:1. Para não depender de ninguém lembrar de "Salvar como PDF", um script de duas dúzias de linhas resolve:

```powershell
# converter-pdf.ps1 — converte todos os .docx de uma pasta em PDF
$word = New-Object -ComObject Word.Application
$word.Visible = $false
Get-ChildItem -Path $args[0] -Filter *.docx | ForEach-Object {
    $doc = $word.Documents.Open($_.FullName)
    $doc.SaveAs([ref]($_.FullName -replace '\.docx$', '.pdf'), [ref]17)  # 17 = wdFormatPDF
    $doc.Close()
}
$word.Quit()
```

Sem instalação, sem biblioteca, sem dependência externa. Usa o que a empresa já paga. E se um dia o Word sair de cena, troca-se o script — não a arquitetura.

---

## 3. O contrato: proposta de esquema do `dados.json` v1.0

Esta é a peça mais importante do documento. **Levar para o projeto do app de campo e fechar antes da Fase 4 de lá.**

### Princípios do esquema

- **Toda entidade tem `id` estável (uuid).** Referência por `"NC-017"` quebra no dia em que alguém renumerar. E vai renumerar.
- **`respostas` é lista plana**, com `areaId` e `itemId`. Estrutura aninhada é bonita de ler e horrível de pivotar. Relatório é pivô.
- **Respostas conformes e NA vêm junto.** Sem elas não existe percentual de conformidade — e é exatamente isso que enriquece o relatório.
- **Mídia referenciada por caminho relativo à raiz do pacote**, nunca absoluto.
- **`versaoSchema` obrigatório**, versionamento semântico. Major diferente → o desktop **recusa** e explica.

```json
{
  "versaoSchema": "1.0",
  "exportadoEm": "2026-07-14T18:32:11-03:00",
  "app": { "nome": "app-campo", "versao": "1.4.2" },

  "inspecao": {
    "id": "insp-9f2c4a10",
    "tipo": "paineis",
    "cliente": { "nome": "Cliente X", "unidade": "Planta Chapecó", "cnpj": null },
    "checklist": { "id": "paineis", "versao": "1.0" },
    "dataInicio": "2026-07-14",
    "dataFim": "2026-07-14",
    "configuracao": {},
    "observacoes": "",
    "parte": { "numero": 1, "de": 1 }
  },

  "inspetores": [
    { "id": "insp-01", "nome": "Leonardo", "aparelho": "tablet-01" }
  ],

  "areas": [
    { "id": "area-03", "nome": "Painel 03", "paiId": null,
      "ordem": 3, "pastaRelativa": "Painel_03" },
    { "id": "area-07", "nome": "QGBT", "paiId": "area-05",
      "ordem": 1, "pastaRelativa": "Sala_Eletrica/Sub_Area_QGBT" }
  ],

  "respostas": [
    { "id": "resp-0a11", "areaId": "area-03", "itemId": "P-07",
      "secao": "Identificação e Sinalização",
      "pergunta": "O painel possui identificação legível dos circuitos?",
      "polaridade": "nao_e_nc",
      "resposta": "nao",
      "geraNc": true,
      "ncId": "nc-0017",
      "inspetorId": "insp-01",
      "registradoEm": "2026-07-14T10:12:00-03:00" }
  ],

  "naoConformidades": [
    { "id": "nc-0017", "numero": 17, "codigo": "NC-017",
      "areaId": "area-03",
      "origem": "checklist",
      "itemId": "P-07",
      "titulo": "Identificação de circuitos ilegível",
      "descricao": "Etiquetas apagadas nos disjuntores 3 a 9.",
      "riscoAlto": null,
      "referenciaNorma": null,
      "documental": null,
      "inspetorId": "insp-01",
      "criadoEm": "2026-07-14T10:12:30-03:00",
      "pastaRelativa": "Painel_03/NC-017",
      "midias": [
        { "tipo": "foto", "arquivo": "2026-07-14_ClienteX_Painel03_NC-017_foto1.jpg", "ordem": 1 },
        { "tipo": "audio", "arquivo": "2026-07-14_ClienteX_Painel03_NC-017_audio.webm", "duracaoSeg": 42 }
      ] }
  ]
}
```

**Campos que variam por tipo de inspeção** (todos presentes, valor `null` quando não se aplica — muito mais fácil de consumir do que campo ausente):

| Tipo | Campos usados |
|---|---|
| Geral | `origem: "livre"`, `itemId: null` |
| Painéis | `origem: "checklist"`, `itemId` |
| Subestações | `+ riscoAlto: true/false`, `inspecao.configuracao.{transformador, disjuntorMT}` |
| Documental | `+ referenciaNorma: "10.2.4-a"`, `documental: { consideracoesEntrevistado, consideracoesEntrevistador }`, `inspecao.entrevistado: { nome, cargo }` |

### Validação na entrada (Fase 1, obrigatório)

O leitor roda um validador antes de qualquer coisa e mostra um **relatório de integridade** na tela:

- `versaoSchema` major compatível?
- Toda `resposta.areaId` existe em `areas`? Todo `paiId` existe?
- Toda NC com `origem: "checklist"` tem `itemId` presente no JSON do checklist?
- Todo `ncId` referenciado existe em `naoConformidades` e vice-versa?
- Numeração sequencial sem buraco e sem duplicata?
- Todo arquivo de mídia listado existe no disco? (checagem opcional, custa I/O)

Nada é gerado enquanto houver erro **crítico**. Avisos passam, mas aparecem em vermelho na tela e numa aba "Ocorrências" da planilha.

---

## 4. O que o escritório acrescenta: `tratativas.json`

Os campos "Ação a ser tomada" e "Data da ação" foram deliberadamente tirados do campo. Eles vivem aqui — e precisam de persistência.

**Decisão:** gravar um `tratativas.json` **dentro da própria pasta da inspeção**, ao lado do `dados.json`.

```json
{
  "versaoSchema": "1.0",
  "inspecaoId": "insp-9f2c4a10",
  "atualizadoEm": "2026-08-07T14:20:00-03:00",
  "porNc": {
    "nc-0017": {
      "acaoTomada": "Reetiquetar circuitos conforme diagrama unifilar.",
      "dataAcao": "2026-08-30",
      "severidade": "media",
      "responsavel": "Manutenção Elétrica",
      "status": "pendente",
      "notas": ""
    }
  }
}
```

### ⚠ Problema novo: dois operadores, um arquivo

Aqui está a consequência não óbvia de "inspetores **e** escritório usam o app". Duas pessoas abrem a mesma inspeção no servidor, cada uma preenche tratativas de NCs diferentes, e a segunda a salvar **apaga o trabalho da primeira**. Sem erro, sem aviso, sem rastro. Só some.

Isso não é hipótese remota: é o cenário provável de uma inspeção com 300 NCs em que faz todo sentido dividir o trabalho.

**Solução (obrigatória na Fase 3, não opcional):** gravação com releitura e mesclagem por NC.

1. Antes de salvar, reler o `tratativas.json` do disco.
2. Comparar o `atualizadoEm` lido com o que estava em memória na abertura.
3. Se mudou, **mesclar por chave de NC** — cada pessoa mexeu em NCs distintas, os dois conjuntos convivem.
4. Se as duas mexeram na *mesma* NC, aí sim mostrar as duas versões lado a lado e deixar a pessoa escolher. Nunca decidir sozinho.
5. Gravar um `historico` com autor e horário por NC, para auditoria.

Custa umas 40 linhas. Vale cada uma, porque a alternativa é alguém refazer duas horas de trabalho e o app perder a confiança do time — e confiança perdida em ferramenta interna não volta.

Complemento barato: campo `autor` no `tratativas.json`, preenchido a partir de um nome escolhido uma vez e guardado localmente. Sem login, sem senha, sem backend. Só saber quem escreveu o quê.

**Por que na pasta e não em `localStorage`:** `localStorage` some quando alguém limpa o navegador, não acompanha o arquivo, não sincroniza pelo servidor da empresa e não sobrevive a troca de máquina. A pasta da inspeção já é a unidade que o time move, faz backup e arquiva. Ela é a fonte da verdade — o `dados.json` é o que veio do campo, o `tratativas.json` é o que o escritório escreveu, e nenhum dos dois sobrescreve o outro. Zero backend mantido, versionamento de graça.

---

## 5. Motor de planilha dirigido por mapeamento

O ponto que destrava o projeto sem o modelo em mãos.

**Fluxo:** o `.xlsx` da empresa (com logo, cabeçalho, formatação) fica em `/modelos/`. O ExcelJS **abre esse arquivo**, escreve as linhas a partir da posição configurada e salva uma cópia. A identidade visual da NORD CONSULT nunca é reconstruída em código — ela é preservada.

`config/modelos/planilha_paineis.json`:

```json
{
  "nome": "Resumo — Inspeção de Painéis Elétricos",
  "arquivoBase": "modelo_paineis.xlsx",
  "nomeSaida": "{cliente}_Paineis_{dataInicio}_Resumo.xlsx",
  "cabecalho": {
    "B2": "{cliente.nome}",
    "B3": "{cliente.unidade}",
    "B4": "{inspecao.dataInicio}",
    "B5": "{inspetores}"
  },
  "abas": [
    {
      "planilha": "Resumo",
      "fonte": "naoConformidades",
      "ordenarPor": ["area.ordem", "numero"],
      "linhaInicial": 9,
      "inserirLinhas": true,
      "colunas": [
        { "col": "A", "campo": "codigo" },
        { "col": "B", "campo": "area.nomeCompleto" },
        { "col": "C", "campo": "item.secao" },
        { "col": "D", "campo": "item.pergunta" },
        { "col": "E", "campo": "descricao" },
        { "col": "F", "campo": "midias.qtdFotos" },
        { "col": "G", "campo": "inspetor.nome" },
        { "col": "H", "campo": "criadoEm", "formato": "data" },
        { "col": "I", "campo": "tratativa.acaoTomada" },
        { "col": "J", "campo": "tratativa.dataAcao", "formato": "data" }
      ]
    }
  ]
}
```

Quando o modelo real chegar, o ajuste é: abrir esse JSON, corrigir letras de coluna e `linhaInicial`. Cinco minutos, sem tocar em JavaScript. É assim que este projeto continua manutenível daqui a dois anos.

**Campos calculados disponíveis no mapeamento** (resolvidos pelo motor, não vêm do JSON bruto): `area.nomeCompleto` (sub-área com o pai, "Sala Elétrica › QGBT"), `midias.qtdFotos`, `item.pergunta`, `item.secao` (buscados no JSON do checklist), `tratativa.*` (do `tratativas.json`), `conformidade.percentual`.

**Ressalva técnica honesta:** ExcelJS preserva estilos, fórmulas simples, mesclagens e imagens, mas pode se atrapalhar com recursos pesados (tabelas dinâmicas, alguns gráficos, validação de dados complexa). Mitigação: manter o modelo simples e **testar com o arquivo real na primeira semana** — se ele passar íntegro pelo ciclo abrir→salvar, a decisão está validada; se não, restringimos o modelo ou partimos para o plano B em Python só do gerador.

---

## 6. Estrutura de arquivos do projeto

```
app-relatorios/
├── index.html                    ← a aplicação inteira, uma tela
├── abrir-app.bat                 ← atalho modo aplicativo (Edge)
├── app.js                        ← orquestração da interface
├── estilos.css
├── src/
│   ├── leitor-pacote.js          ← abre pasta/ZIP, lê dados.json e tratativas.json
│   ├── validador.js              ← integridade + versão de esquema
│   ├── modelo-dados.js           ← índices em memória (mapas por id) e campos calculados
│   ├── motor-planilha.js         ← mapeamento JSON + ExcelJS
│   └── tratativas.js             ← leitura/gravação do tratativas.json
├── config/
│   ├── checklists/
│   │   ├── paineis.json          ← MESMO arquivo do app de campo
│   │   ├── subestacoes.json
│   │   └── documental.json
│   └── modelos/
│       └── planilha_paineis.json
├── modelos/
│   └── modelo_paineis.xlsx       ← modelo da empresa
├── vendor/
│   ├── exceljs.min.js
│   └── jszip.min.js
└── docs/
    └── esquema-dados-json.md     ← o contrato, versionado
```

**Sobre os checklists:** eles precisam ser **o mesmo arquivo**, não uma cópia. Duas cópias divergem — é questão de tempo. Sugestão: pasta única no servidor, e uma rotina de cópia documentada, com o campo `versao` conferido pelo validador. Se `dados.json` diz `checklist.versao: "1.2"` e o desktop tem a `1.0`, a tela avisa antes de gerar qualquer coisa.

---

## 7. Interface da Fase 1 (uma tela, quatro passos)

```
┌──────────────────────────────────────────────────────┐
│  Relatórios de Inspeção — NORD CONSULT               │
├──────────────────────────────────────────────────────┤
│  1 · [ Abrir pasta da inspeção… ]                    │
│      ✔ ClienteX_InspecaoPaineis_2026-07-14           │
│                                                       │
│  2 · Conferência                                      │
│      Tipo: Painéis Elétricos · Checklist v1.0        │
│      12 áreas · 214 respostas · 47 NCs · 138 fotos   │
│      Conformidade: 78,0%                              │
│      ⚠ 2 avisos  ✖ 0 erros     [ ver detalhes ]      │
│                                                       │
│  3 · Modelo: Resumo — Painéis Elétricos      ▾       │
│                                                       │
│  4 · [ Gerar planilha ]                               │
└──────────────────────────────────────────────────────┘
```

Sem menu, sem abas, sem configurações escondidas. Quatro passos de cima para baixo. Se a pessoa precisar de treinamento para usar isso, o design falhou.

---

## 8. Plano de fases

| Fase | Entrega | Depende de |
|---|---|---|
| **0 — Contrato** | Esquema `dados.json` v1.0 aprovado nos dois projetos; modelo .xlsx real em mãos; checklist `paineis.json` transcrito com polaridade revisada | Pendência do Leo |
| **1 — Leitor + Conferência** | Abre pasta, valida, mostra os números na tela. **Não gera nada ainda.** | Fase 0 |
| **2 — Planilha resumo de Painéis** | ✦ *o pedido atual* — motor de mapeamento + ExcelJS + download | Fase 1 |
| **3 — Tratativas** | Tabela editável de ação/data/responsável/status, gravando `tratativas.json` **com mesclagem multiusuário**, refletido na planilha | Fase 2 |
| **4 — Relatório Word (+ PDF derivado)** | `.docx` com fotos embutidas via docx.js, leitura sob demanda das mídias, + script de conversão para PDF | Fase 3 + template Word da empresa |
| **5 — Demais tipos + consolidado** | Geral, Subestações (risco alto), Documental (NR-10); histórico multi-inspeção do cliente | Fase 4 |

Reparou que a Fase 1 não gera nada? É de propósito. Ela existe para provar que a leitura e a validação estão certas **antes** de qualquer saída bonita esconder um erro de interpretação. Se os 47 NCs e os 78% batem com a conferência manual do inspetor, o resto é encanamento.

---

## 9. Volume: por que isso aguenta 1000 NCs e vários GB

- A Fase 2 lê **só o `dados.json`** — alguns MB no pior caso. Instantâneo.
- Mídias só são tocadas na Fase 4, e via `FileSystemFileHandle`, **uma foto por vez**, redimensionada antes de embutir. O ZIP nunca é carregado inteiro na memória.
- Se o pacote vier dividido por área (previsto no app de campo), o desktop detecta `inspecao.parte` e oferece juntar as partes antes de gerar.
- Índices por `id` construídos uma vez na abertura (`Map`), então nada de busca linear dentro de laço — com 1000 NCs × 214 respostas isso seria a diferença entre 50ms e 20 segundos.

---

## 10. Riscos e pendências

| Risco | Gravidade | Mitigação |
|---|---|---|
| Esquema do `dados.json` mudar na Fase 4 do app de campo | **Alta** | Fechar o contrato agora, `versaoSchema` com recusa explícita |
| Modelo .xlsx com recursos que o ExcelJS quebra | Média | Testar ciclo abrir→salvar na primeira semana |
| Polaridade de item errada no checklist | **Alta** | NC gerada errada em campo. Não é problema do desktop, mas o desktop deve exibir polaridade na conferência para facilitar auditoria |
| Divergência entre cópias do checklist | Média | Conferência de `checklist.versao` no validador |
| Escritório querer editar NC (não só acrescentar ação) | Média | Fora do escopo v1. Se entrar, vira `correcoes.json` — nunca alterar o `dados.json` original |
| **Dois operadores sobrescreverem tratativas** | **Alta** | Releitura + mesclagem por NC antes de gravar (seção 4). Perda silenciosa de trabalho é inaceitável |
| Word e PDF divergirem visualmente | Média | PDF derivado do .docx, nunca gerado em paralelo (seção 2) |
| Navegador atualizar e quebrar File System Access API | Baixa | API estável desde 2021; fallback para `<input webkitdirectory>` em modo leitura |

---

## 11. Prompt inicial para o Claude Code (Fases 1 e 2)

> Estou construindo um aplicativo desktop de geração de relatórios para uma consultoria de engenharia elétrica. Ele lê pacotes exportados por um app de campo (PWA) e gera planilhas.
>
> **Stack obrigatória:** HTML + JavaScript puro (ES modules), sem framework, sem build step, sem CDN. Bibliotecas vendorizadas em `/vendor` (ExcelJS, JSZip). Roda localmente no **Chrome** via `file://`, usando File System Access API (navegador único garantido — pode usar a API sem polyfill). Interface 100% em pt-BR.
>
> **Princípio central:** manutenibilidade por um não-desenvolvedor. Código legível e comentado em português vale mais que código esperto. Nada de abstração antecipada.
>
> **Fase 1 — Leitor e Conferência.** Implemente: (a) botão que abre uma pasta de inspeção via `showDirectoryPicker()`; (b) leitura e parse de `dados.json` conforme o esquema em `docs/esquema-dados-json.md`; (c) validador que confere versão de esquema, integridade referencial (areaId, paiId, itemId, ncId), numeração sequencial e existência de mídias, separando erros críticos de avisos; (d) construção de índices em `Map` por id; (e) tela única mostrando cliente, tipo, contagens (áreas, respostas, NCs, fotos), percentual de conformidade e o painel de ocorrências. Nesta fase **não gere nenhum arquivo**.
>
> **Fase 2 — Planilha resumo de Painéis.** Implemente o motor de planilha dirigido por `config/modelos/planilha_paineis.json`: abrir o `.xlsx` modelo com ExcelJS preservando formatação, resolver os campos calculados (`area.nomeCompleto`, `item.pergunta`, `item.secao`, `midias.qtdFotos`, `tratativa.*`), inserir as linhas a partir de `linhaInicial` e disparar o download com o nome definido em `nomeSaida`.
>
> Comece pela Fase 1 completa e testável antes de escrever qualquer linha da Fase 2. Ao final de cada fase, liste o que testar manualmente.

---

## 12. O que falta para começar (bloqueadores reais)

1. **O modelo da planilha resumo (.xlsx)** — mencionado, não anexado. É o item mais bloqueante da Fase 2.
2. **Aprovação do esquema `dados.json` v1.0** por este projeto e pelo projeto do app de campo.
3. **`paineis.json`** — os 16 itens transcritos com seção e polaridade revisada.
4. ~~Definir formato do relatório final~~ ✔ **Resolvido: Word canônico, PDF derivado.** Falta apenas o **template .docx da empresa** (logo, cabeçalho, rodapé) — não bloqueia a Fase 2, bloqueia a Fase 4.

---

*Documento de arquitetura v0.9 — rascunho para validação. Fecha as decisões de stack e de contrato de dados; aguarda o modelo de planilha para detalhar o mapeamento da Fase 2.*
