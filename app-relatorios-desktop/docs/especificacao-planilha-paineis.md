# Fase 2 — Planilha Resumo de Painéis: especificação validada

**Versão:** 3.0 — modelo de 14 itens, `Ranking!M` corrigido
**Status:** ✅ mapeamento validado contra dados reais (GelnexPY, 123 painéis, 256 NCs)
**Anexo:** `GelnexPY_Paineis_2026-08-03_Resumo.xlsx` — gerado de verdade, 5.944 fórmulas recalculadas, zero erros, formatação condicional verificada visualmente.

---

## 1. O que mudou nesta versão

- ✅ **Coluna O confirmada** = `pan-014` ("Componentes internos identificados" = "Circuitos identificados").
- ✅ **Iluminação e ventilação entraram no modelo** (colunas Q e R, peso 0,02 cada). As 13 NCs que ficavam órfãs agora contam no ranking. **Zero NCs fora do índice.**
- ✅ **`pan-015` (iluminação da sala) e `pan-016` (ergonomia) ficam fora por decisão.** Registrado no código como `IGNORADOS`, não como esquecimento. No pacote real não geraram nenhuma NC, então o impacto hoje é zero — mas a decisão precisa estar explícita, senão daqui a um ano alguém "conserta" o que era intencional.
- ✅ **Bug do `Ranking!M` corrigido no arquivo-fonte.** Verificado: a fórmula agora lê a coluna `P` (Limpeza). O contorno que o gerador aplicava foi removido — o modelo é a fonte da verdade de novo.
- 🔴 **Descoberto que o openpyxl destrói a formatação condicional das respostas** (seção 3.3).

**Deslocamento de colunas em relação à v1:** legenda foi de `T2:T4` para **`V2:V4`**; ranking de `Q` para **`S`**; outras NCs de `R` para **`T`**; a aba Ranking terminava em `AO`, agora em **`AU`**. Nenhuma dessas posições pode ficar hardcoded no app — é exatamente por isso que o mapeamento vive num JSON de configuração.

---

## 2. Esquema real do `dados.json` (v1.0 observada)

O `dados.json` real **não é** o que o documento de contexto descrevia:

| Item | Documento dizia | Pacote real |
|---|---|---|
| Hierarquia | `areas[].subareas[]` estruturado | `subareas` **sempre vazio**; hierarquia embutida na string com `›` |
| `areas` | registro de áreas | na prática é um **índice de NCs** — painel sem NC não aparece |
| Estrutura de pastas | `Área/NC-017/` | `NCs/AA-MM-DD/Área/Painel/NC-017/` |
| Nomes de arquivo | `2026-07-14_ClienteX_Painel03_NC-017_foto1.jpg` | `NC-037_foto01.jpg` |
| Sanitização | sem acentos, espaços → `_` | **acentos e espaços preservados** (`CCM FÁBRICA P119`) |
| `versaoSchema` | previsto | **ausente** ⚠ |
| Divisão em partes | campo no JSON | só no `LEIA-ME.txt`, em prosa ⚠ |

```
app                    string
exportadoEm            ISO
inspecao { tipo, rotuloTipo, status, inspetor, criadoEm, atualizadoEm }
cliente  { nome }
totais   { areas, ncs, fotos, audios }
checklist[] { secao: "Área › Painel — Verificações do painel",
              itens[] { id, texto, status, nc } }
areas[]     { nome, subareas[], ncs[] { numero, descricao, criadoEm, itemId,
              itemTexto, pasta, descricaoArquivo, fotos[], audios[] } }
```

`status` ∈ `conforme` | `nao_conforme` | `nao_aplica` | `null`

**A fonte da lista de painéis é `checklist[]`, não `areas[]`.** No pacote real: 123 seções de checklist contra 81 entradas em `areas` — os 42 painéis 100% conformes existem só no checklist. Gerar a partir de `areas` perderia 34% dos painéis, justamente os melhores.

---

## 3. Mapeamento das colunas (modelo v2)

Uma linha por seção com sufixo `— Verificações do painel`, a partir da **linha 6**.

| Col | Cabeçalho | Origem | Peso |
|---|---|---|---|
| B | NÚMERO DO PAINEL | sequencial, **texto** (formato `@`) | — |
| C | PAINEL | último segmento após `›` | — |
| D | Área e Sub-área | segmentos anteriores, unidos por ` › ` | — |
| E | Painel com nomenclatura | `pan-001` | 0,02 |
| F | Sinalização de perigo | `pan-002` | 0,03 |
| G | Restrição de acesso | `pan-003` | 0,03 |
| H | Sistema de bloqueio | `pan-004` | 0,10 |
| I | Aterramento | `pan-005` | 0,21 |
| J | Diagrama unifilar | `pan-006` | 0,05 |
| K | Partes vivas protegidas | `pan-007` | 0,24 |
| L | Existe DR | `pan-008` | 0,05 |
| M | DR compatível | `pan-009` | 0,04 |
| N | Disjuntor geral | `pan-010` | 0,06 |
| O | Circuitos identificados | `pan-014` | 0,08 |
| P | Limpo e organizado | `pan-011` | 0,05 |
| Q | Iluminação interna | `pan-012` | 0,02 |
| R | Ventilação forçada | `pan-013` | 0,02 |
| S | Ranking NR-10 | **fórmula `=Ranking!AU{linha}` — nunca sobrescrever** | — |
| T | Outras não conformidades | itens adicionais + avisos | — |

Fora do escopo: `pan-015`, `pan-016`.
Aterramento e partes vivas somam 0,45 — quase metade do índice. Faixas em S: <40% vermelho · 40–69% amarelo · ≥70% verde.

### 3.1 ✅ Bug do `Ranking!M` resolvido no modelo

Na v2, `Ranking!M` ("Limpeza e organização interna") lia a coluna `Q` (Iluminação) em vez da `P`. Corrigido no arquivo-fonte e conferido item a item: as 14 fórmulas do bloco de pesos agora leem `E`→`R` na ordem certa. O contorno que o gerador aplicava foi removido.

### 3.2 ⚠ Os símbolos são glifos Wingdings 2, não texto

As células E–R **não contêm "Sim"/"Não"**. Contêm caracteres da fonte Wingdings 2, e as fórmulas comparam contra `$V$3` e `$V$4`:

| Status no JSON | Caractere | Fonte obrigatória |
|---|---|---|
| `conforme` | `<` (U+003C) | Wingdings 2, 14pt |
| `nao_conforme` | `=` (U+003D) | Wingdings 2, 14pt |
| `nao_aplica` | `\x98` (U+0098) | Wingdings 2, 14pt |

Escrever a palavra "Não" não gera erro: a comparação nunca casa, todo painel pontua 100% e tudo fica verde. **Teste de aceitação obrigatório:** gerar, recalcular e conferir que existe pelo menos um painel abaixo de 100%.

### 3.3 🔴 O openpyxl destrói a formatação condicional das respostas

O verde/vermelho das células E–R **não** é formatação condicional comum. São 12 blocos `<x14:conditionalFormatting>` dentro de `<extLst>` — uma extensão do formato OOXML (regras `beginsWith` comparando contra `$V$2`/`$V$3`).

Bibliotecas que não conhecem a extensão **descartam o bloco inteiro ao salvar**, sem erro. O arquivo abre normalmente, as fórmulas funcionam, o ranking calcula — e a grade fica toda branca. Mais uma falha silenciosa, e das piores, porque a leitura visual da planilha é o principal uso dela.

**Regras cobertas:** `E6:R6`, `E7`, `F7:G7`, `H7:N7`, `E8:N517`, `O7:O517`, `P7:P517`, `Q7:Q517`, `R7:R348` — mais o `S6:S348` do ranking, esse sim formatação condicional comum. Cores: `#00CC66` para conforme, `#FF5050` para não conforme, NA sem preenchimento.

**Tratamento no protótipo:** após salvar, o `<extLst>` original é reinjetado no XML da aba, com os namespaces `x14`/`xm` garantidos na raiz e o bloco posicionado como último filho de `<worksheet>` (exigência do formato).

**Para a implementação JS:** confirmar em teste que o ExcelJS preserva o `extLst`. Se não preservar, a mesma reinjeção via JSZip é viável — o `.xlsx` é um ZIP de XML. **Teste de aceitação obrigatório:** abrir o arquivo gerado e conferir que existe pelo menos uma célula verde e uma vermelha na grade de respostas.

### 3.4 Altura de linha

O modelo fixa 54pt por linha com quebra de texto na coluna T. O aviso de item não inspecionado é o texto mais longo da planilha e ultrapassa isso — o Excel corta o excedente sem avisar. O gerador calcula a altura a partir do comprimento do texto (~72 caracteres por linha na largura atual da coluna).

---

## 4. Defeitos nos dados de campo

### 4.1 🔴 Item sem resposta infla o ranking

50 itens com `status: null` em 9 painéis. Em branco, não casam com o símbolo de NA nem com o de "Não" — entram inteiros no denominador **e** recebem pontuação cheia.

Caso real: painel *Nobreak*, 3 NCs, 10 itens nunca inspecionados → **92%, verde**. Tratando como NA: **55,6%, amarelo**.

**Implementado:** `null` → NA (sai do denominador) **+ aviso nomeando os itens pulados na coluna T**. Configurável em `itensSemResposta: "na" | "vazio" | "naoConforme"` — mas "vazio" é a única das três que mente sem avisar, e não deveria ser oferecida.

**Correção de raiz:** o app de campo não deveria permitir finalizar inspeção com item sem resposta. Exigir NA explícito custa um toque e mata a ambiguidade na origem.

### 4.2 🔴 Divisão por zero com painel totalmente NA

Dois painéis (*CCM FÁBRICA* e *CCM EFLUENTES*) têm zero itens respondidos. Todos em NA → `Ranking!P` = 0 → `#DIV/0!` em cascata.

**Tratamento:** linha de Ranking limpa, S em branco, aviso em T. Ranking indefinido não é ranking zero — e muito menos 100%.
**Sugestão permanente:** `IFERROR(...;0)` em `Ranking!R..AE`.
Os dois se chamam igual à própria área — provável painel criado por engano. Conferir com o Anibal.

### 4.3 🟡 Menores

- **36 buracos** na numeração de NCs (faixa 1→292, 256 existentes) — provável exclusão em campo, mas o validador precisa avisar.
- **`#REF!` preexistente** em `Resultado!U8` (era `S8` na v1). Removido na geração.
- **180 fotos ausentes** — esperado (parte 1 de 2), mas o `dados.json` não tem campo de parte. Precisa virar `parte: {numero, de}`.
- **1 item extra** criado em campo (`extra-38-...`, "Oxidação barramentos") → vai para a coluna T.

---

## 5. Resultado da geração real

```
Cliente: GelnexPY · Inspetor: Anibal Vargas · 2026-08-03
123 painéis · 12 áreas · 256 NCs

Respostas:  1332 conforme · 255 não conforme · 331 NA · 50 sem resposta
NCs fora do ranking: 0   (eram 13 na v1)

Ranking:    121 painéis pontuados (2 sem ranking, não inspecionados)
            média 84,2% · mínimo 6,7% · máximo 100%
            🔴 4 abaixo de 40%   🟡 13 entre 40-69%   🟢 104 acima de 70%

Piores:     6,7%  Administracion › Painel geral
           18,0%  Compostagem › Painel sem identificação
           31,0%  Administracion › Comedor › Painel sem nome 2
           34,5%  Compostagem › Painel tanque de lodo
           40,2%  Sala CCM Fabrica › PAINEL SEM IDENTIFICAÇÃO

Validação:  5.944 fórmulas · 0 erros · logo preservada
            12 blocos de formatação condicional x14 preservados
            conferência visual: verde/vermelho/NA corretos na grade
```

O *Painel geral* da Administracion com 6,7% merece atenção antes de qualquer outra coisa — é o pior da planta e o nome sugere que alimenta o prédio inteiro.

---

## 6. Ajustes na arquitetura

- **ExcelJS confirmado.** Abrir→preencher→salvar preservou logo, formatação condicional e 5.944 fórmulas. Risco encerrado.
- **Ler o ZIP inteiro é desnecessário.** O `dados.json` tem 484 KB num pacote de 160 MB (0,3%). Extrair só essa entrada.
- **Sem multiusuário.** Só o inspetor opera. A mesclagem de tratativas sai do escopo obrigatório; fica só a releitura antes de gravar.
- **Nomes com acento e espaço.** Tratar `pasta`/`fotos` como caminhos literais e normalizar (NFC) antes de comparar.
- **Posições de coluna nunca hardcoded.** A v2 moveu ranking, legenda e limites. O JSON de mapeamento absorve isso; código não.
- **Verificação sempre no arquivo entregue, nunca numa cópia.** Durante a validação desta versão, uma prévia foi gerada recarregando o arquivo de saída com openpyxl — o que apagou de novo a formatação condicional e deu um falso negativo. Conferir o artefato final, não um derivado dele.

---

## 7. Pendências restantes

| # | Pendência | Com quem |
|---|---|---|
| 1 | `IFERROR` no bloco de normalização do Ranking (`R..AE`) | Leo |
| 2 | `versaoSchema` e `parte: {numero, de}` no `dados.json` | App de campo |
| 3 | Impedir finalização com item sem resposta | App de campo |
| 4 | Painéis *CCM FÁBRICA* e *CCM EFLUENTES* são reais? | Anibal |
| 5 | Confirmar que o ExcelJS preserva o `extLst` (senão, reinjetar via JSZip) | Fase 2 |

✅ Resolvidas: mapeamento da coluna O · destino de iluminação e ventilação · escopo de `pan-015`/`pan-016` · bug do `Ranking!M`.

---

*Validada contra pacote real em 07/08/2026. O protótipo `gerar_planilha_paineis_PROTOTIPO.py` é a referência executável do mapeamento; a implementação JS do app é a tradução dele.*
