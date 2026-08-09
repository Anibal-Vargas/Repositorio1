# CLAUDE.md

Contexto do projeto para o Claude Code. Leia antes de mexer em qualquer coisa.

---

## O que é

Aplicativo desktop da **NORD CONSULT** (consultoria de engenharia elétrica) que lê
pacotes `.zip` exportados por um **aplicativo de campo** (PWA offline usado por
inspetores) e gera planilhas e relatórios de inspeção conforme a **NR-10**.

São dois projetos independentes. Este aqui é o **desktop**. O contrato entre eles
é o arquivo `dados.json` dentro do ZIP. O desktop não acessa celular, servidor
nem banco de dados: só lê arquivos.

**Estado atual:** a geração da planilha de painéis está pronta e validada contra
dados reais de produção (123 painéis, 256 NCs). O relatório de não conformidades
ainda não existe.

---

## Regras inegociáveis

Estas vieram do projeto do app de campo e do perfil de quem mantém o código.
**Não as viole "só desta vez".**

| Regra | Por quê |
|---|---|
| **Sem build step.** Nada de webpack, vite, bundler, transpilador. | Quem mantém não é desenvolvedor profissional. Editar arquivo, recarregar página. |
| **Sem framework.** JavaScript puro, sem React/Vue/etc. | Mesma razão. |
| **Sem CDN.** Bibliotecas vendorizadas em `vendor/`. | O servidor do escritório pode estar sem internet. A build de hoje tem que ser idêntica à de daqui a dois anos. |
| **Scripts clássicos, sem `import`/`export`.** | O app roda via `file://` e o Chrome bloqueia módulos ES nesse protocolo. Já testado, já quebrou. |
| **Sem backend.** | Tudo roda local. |
| **pt-BR em tudo:** interface, nomes de variável, comentários, commits. | Convenção do projeto. |
| **Chrome como alvo.** | Confirmado pelo cliente. Usa File System Access API. |

**Também não use ExcelJS nem nenhuma biblioteca de planilha.** Está testado:
ExcelJS destrói a formatação condicional do modelo (detalhes abaixo). A
manipulação é feita direto no XML com JSZip.

---

## As três armadilhas (leia isto antes de mexer no gerador)

Este projeto tem uma característica incomum e perigosa: **as três formas de
quebrar a planilha não produzem erro nenhum.** Produzem um arquivo que abre,
calcula, parece perfeito — e está errado. Num laudo de NR-10 assinado, isso é
o pior desfecho possível.

### 1. As respostas são glifos Wingdings 2, não texto

As células de resposta (colunas F–S) não contêm "Sim"/"Não". Contêm caracteres
da fonte Wingdings 2, e as fórmulas da aba Ranking comparam contra `$W$3`/`$W$4`:

| Status no JSON | Caractere |
|---|---|
| `conforme` | `<` (U+003C) |
| `nao_conforme` | `=` (U+003D) |
| `nao_aplica` | `\u0098` |

Gravar a palavra "Não" não dá erro: a comparação nunca casa, **todo painel marca
100% e a planilha inteira fica verde.**

### 2. Item sem resposta em campo

Quando o inspetor não responde um item, o JSON traz `status: null`. Deixado em
branco na planilha, o item **entra inteiro no denominador do ranking e recebe
pontuação cheia** — item que ninguém olhou vira item aprovado.

Caso real medido: painel com 3 NCs e 10 itens não inspecionados marcava
**92%, verde**. Tratado como NA: **55,6%, amarelo**.

O gerador lança `null` como NA e escreve na coluna "Outras não conformidades"
quais itens foram pulados. **Nunca deixe em branco.**

### 3. Valores em cache

O modelo guarda resultados calculados (`T6` vem com `<v>1</v>` = 100%). Sem
`fullCalcOnLoad="1"` no `workbook.xml`, o Excel mostra 100% em todos os painéis
até alguém apertar Ctrl+Alt+F9.

### E a quarta: formatação condicional que evapora

O verde/vermelho das respostas são 12 blocos `<x14:conditionalFormatting>` dentro
de `<extLst>` — uma extensão do OOXML. **openpyxl e ExcelJS descartam esse bloco
ao salvar, sem aviso.** O arquivo abre, calcula, e a grade fica branca.

É por isso que o gerador manipula XML direto em vez de usar biblioteca.

---

## Como verificar que não quebrou

```bash
node testes/verificar.mjs
```

Não precisa de `npm install` — usa o JSZip vendorizado do próprio app.
São 12 testes, um para cada armadilha acima. **Rode antes e depois de qualquer
alteração no gerador.** Se algum falhar, não entregue planilha.

Conferência humana, 10 segundos, abrindo o arquivo gerado:
- existe pelo menos uma célula **verde** e uma **vermelha** na grade
- existe pelo menos um painel com ranking **abaixo de 100%**
- cabeçalho traz cliente, cidade e estado

Tudo branco, tudo verde ou tudo 100% = quebrou.

---

## Mapa do código

```
index.html              As 3 telas + estilos + lógica de interface
src/planilha.js         Motor: dados.json -> planilha preenchida
modelo/modelo-base64.js A planilha modelo embutida (base64)
vendor/jszip.min.js     Única dependência
ferramentas/            Script para reembutir o modelo
docs/                   Arquitetura, especificação, modelo original
testes/                 Suíte de verificação + fixtures reais
```

### Fluxo do aplicativo

Tela 1 (apresentação) → Tela 2 (escolher o que gerar) → Tela 3 (3 etapas
sequenciais: dados do cliente → carregar .zip → gerar). Botão **Sair** sempre
habilitado em todas as telas.

### O gerador, em uma frase

Abre o `.xlsx` modelo como ZIP, edita **só as células de dados** dentro do XML
preservando o atributo de estilo, e reescreve o ZIP. Tudo o mais permanece
byte a byte idêntico.

---

## Mapeamento de colunas (modelo atual)

Uma linha por seção de checklist terminada em `— Verificações do painel`,
a partir da **linha 6**.

| Col | Conteúdo | Item |
|---|---|---|
| B | Item (sequencial, **texto**) | — |
| C | Painel | último segmento após `›` |
| D | Área | primeiro segmento |
| E | Sub-área | segmentos do meio |
| F–S | 14 respostas do checklist | `pan-001` a `pan-014` (ver `COLUNAS` em `src/planilha.js`) |
| T | Ranking NR-10 | fórmula `=Ranking!AU{linha}` — **nunca sobrescrever** |
| U | Outras não conformidades | itens extras + avisos |

Fora do escopo por decisão do cliente: `pan-015` (iluminação da sala) e
`pan-016` (ergonomia). Estão na constante `IGNORADOS`, não é esquecimento.

**As posições de coluna já mudaram três vezes** durante o desenvolvimento — o
ranking andou de `Q` para `S` e depois para `T`, a legenda de `T` para `V` e
depois para `W`. Elas estão todas no topo de `src/planilha.js`. Quando o modelo
mudar, é lá que se ajusta, e o `docs/modelo-original.xlsx` precisa ser
substituído junto (`python ferramentas/embutir_modelo.py novo.xlsx`).

---

## Sobre o `dados.json`

O esquema real **não bate** com o que a documentação original do app de campo
descrevia. O que vale é o que está em `testes/fixtures/dados-gelnex.json`
(pacote real de produção).

Pontos que costumam surpreender:

- **A lista de painéis vem de `checklist[]`, não de `areas[]`.** O array `areas`
  só contém áreas que têm NC — painéis 100% conformes não aparecem lá. No pacote
  real: 123 seções de checklist contra 81 entradas em `areas`. Gerar a partir de
  `areas` perderia 34% dos painéis, justamente os melhores.
- **`subareas` vem sempre vazio.** A hierarquia está embutida na string do nome,
  separada por `›`: `"Área › Sub-área › Painel"`.
- **Não existe `versaoSchema`.** Nem campo de parte. Nomes de arquivo e pasta
  mantêm acentos e espaços, ao contrário do que a documentação dizia.

---

## Pendências

### Neste projeto
1. **Alinhar o visual com o app de campo.** Todas as cores estão num único bloco
   `:root` no topo do `index.html`. Falta receber o CSS ou prints do app de campo.
2. **Relatório de não conformidades** (Word + PDF). O botão existe na tela 2,
   desabilitado. Decisão já tomada: gerar `.docx` com docx.js e derivar o PDF do
   próprio Word via script PowerShell — **nunca dois motores de renderização em
   paralelo**, eles divergem.
3. Campos de escritório ("Ação a ser tomada", "Data da ação") gravados num
   `tratativas.json` ao lado do `dados.json`, na pasta da inspeção.

### Dependem do outro projeto (app de campo)
4. **Adicionar `versaoSchema`** ao `dados.json`.
5. **Adicionar `parte: {numero, de}`.** Hoje a detecção de pacote dividido lê o
   nome da pasta e o `LEIA-ME.txt` por regex. Se alguém renomear a pasta, o app
   acha que é arquivo único e gera a planilha pela metade **sem avisar**.
6. **Impedir finalizar inspeção com item sem resposta.** Mata a armadilha 2 na
   origem — exigir NA explícito custa um toque.

### No modelo da planilha
7. `IFERROR` no bloco de normalização do Ranking. Painel com todos os itens NA
   zera o denominador e estoura `#DIV/0!` em cascata. O gerador contorna
   limpando a linha, mas a guarda deveria estar no modelo.

---

## Cuidados ao editar `src/planilha.js`

- A aba Ranking usa **fórmulas compartilhadas** (`<f t="shared">`). Limpar a
  linha que contém o "mestre" deixa as dependentes órfãs. Há mestres nas linhas
  133, 197, 261 e 325. Hoje não sobra nenhum órfão, mas se a faixa de limpeza
  mudar, o teste correspondente pega.
- As células de resposta **já têm Wingdings 2 no estilo do modelo**. Não é
  preciso mexer em fonte, só escrever o caractere.
- Ao escrever numa célula, **preserve o atributo `s=`** (índice de estilo).
  Perdê-lo destrói bordas, cores e formato numérico daquela célula.
- Linhas fantasma: o modelo vem pré-numerado até 343 painéis. As linhas além do
  último painel real precisam ser limpas nas duas abas, senão o cliente recebe
  centenas de painéis vazios marcando 100%.

---

## Primeiros comandos sugeridos

```bash
node testes/verificar.mjs      # confirma que tudo está verde
```

Depois abra o `index.html` no Chrome (ou use `Abrir aplicativo.bat` no Windows)
e gere uma planilha com um pacote real para ver o resultado.
