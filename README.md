# Redução de relatórios .docx (compressão de fotos embutidas)

Script para reduzir o tamanho de relatórios técnicos em Word (.docx) de 200+ MB,
recomprimindo as fotos embutidas em `word/media` **sem alterar layout, texto,
legendas ou posição das imagens**.

## Como funciona

Um `.docx` é um arquivo ZIP e o tamanho de **exibição** de cada imagem é definido
no XML do documento — ele não muda quando o arquivo de imagem em `word/media` é
substituído por outro de menor resolução com o mesmo nome. O script:

1. Processa **um arquivo por vez** (seguro para memória, mesmo com arquivos de 200+ MB);
2. Nunca altera o original (aberto somente para leitura); o resultado é gravado na pasta de saída;
3. Para cada JPEG/PNG de `word/media`:
   - redimensiona para no máximo **1600 px** na maior dimensão (proporção mantida) —
     suficiente para impressão nítida em largura de página A4;
   - recomprime (JPEG qualidade 80 com EXIF/ICC preservados; PNG com otimização máxima);
   - substitui dentro do ZIP com **o mesmo nome e formato** (sem conversão PNG→JPEG);
   - se a versão nova ficar **maior** que a original (comum em PNG), mantém a original;
   - ignora vetoriais (EMF/WMF/SVG) e imagens menores que 200 KB;
4. Reconstrói o ZIP com compressão deflate — todas as partes que não são imagem
   são copiadas **byte a byte** (nenhum XML é tocado);
5. **Validação obrigatória** de cada arquivo gerado:
   - abre com `python-docx` sem erros;
   - nº de parágrafos, tabelas e imagens idêntico ao original;
   - partes não-imagem byte a byte idênticas (verificação por CRC);
   - teste de integridade do ZIP;
   - se qualquer verificação falhar, o gerado é **descartado** e uma cópia
     **intacta** do original é colocada na pasta de saída, com a falha registrada no log;
6. Gera `log_reducao.txt` na pasta de saída (tamanho antes/depois, % de redução,
   imagens processadas/puladas e falhas por arquivo) e um resumo geral, indicando
   os arquivos que restaram acima de 100 MB e quanto do peso deles vem de PNGs.

**Regra de ouro implementada:** na dúvida entre reduzir mais e preservar a
integridade, o script preserva a integridade.

## Requisitos

- Python 3.8 ou superior ([python.org/downloads](https://www.python.org/downloads/))
- Bibliotecas Pillow e python-docx:

```bat
py -m pip install -r requirements.txt
```

## Uso (Windows)

Com as pastas padrão (`C:\Temp\RNCs\Originais` → `C:\Temp\RNCs\Compactados`):

```bat
py reduzir_docx.py
```

Ou informando as pastas:

```bat
py reduzir_docx.py --entrada "C:\Temp\RNCs\Originais" --saida "C:\Temp\RNCs\Compactados"
```

Ao final, o console e o `log_reducao.txt` mostram o resumo geral e a lista de
arquivos ainda acima de 100 MB (com o peso em PNGs de cada um), para decidir
sobre uma eventual segunda passada convertendo PNGs fotográficos em JPEG.

## 2ª passada (opcional): `converter_png_jpeg.py`

Se, mesmo após a 1ª passada, algum relatório continuar acima de 100 MB por
causa de PNGs, `converter_png_jpeg.py` converte os **PNGs fotográficos**
desses arquivos para JPEG — só rode depois de autorizar essa conversão.

### Por que o layout não é afetado

Um `.docx` referencia cada imagem por um "Id de relacionamento" (rId), nunca
pelo nome do arquivo — o texto (`word/document.xml`, cabeçalhos, rodapés)
nunca menciona `"image7.png"` diretamente. Por isso, converter PNG→JPEG não
exige tocar em nenhum texto do documento:

1. `word/media/imageN.png` é recomprimido e vira `word/media/imageN.jpeg`;
2. em **todos** os arquivos `.rels` que apontavam para esse PNG (documento
   principal, cabeçalhos, rodapés, notas etc.) o `Target` é atualizado para
   o novo nome `.jpeg` — essa é a "atualização das referências internas";
3. em `[Content_Types].xml` garante-se que a extensão jpeg está declarada
   (adiciona se faltar); nada mais é alterado;
4. `word/document.xml` e as demais partes de texto permanecem **byte a
   byte idênticas** ao arquivo de entrada — a validação confere isso por CRC.

### Critério "PNG fotográfico" (só esses são convertidos)

- tamanho ≥ 200 KB (mesmo piso da 1ª passada);
- **sem transparência real** (canal alfa com valores intermediários — PNGs
  totalmente opacos são elegíveis);
- textura fotográfica: após reduzir a RGB, tem mais de ~4096 cores
  distintas numa amostra sem interpolação. PNGs de poucas cores (logos,
  diagramas, carimbos, capturas de tela) são mantidos como PNG, pois JPEG
  costuma piorar a nitidez desse tipo de imagem e não reduzir o tamanho;
- a versão JPEG só é aceita se ficar ao menos 5 % menor que o PNG original;
  caso contrário, o PNG original é mantido.

### Validação obrigatória (mesmo rigor da 1ª passada)

- abre com `python-docx` sem erros; parágrafos/tabelas/imagens inline
  idênticos ao arquivo de entrada desta passada;
- todas as partes que **não** são `.rels` / `[Content_Types].xml` / mídia
  convertida permanecem byte a byte idênticas (CRC) — inclui
  `document.xml`, cabeçalhos, rodapés, notas, estilos etc.;
- cada `.rels` é conferido relacionamento a relacionamento: o único tipo de
  diferença permitido é o `Target` apontar para o novo `.jpeg` no lugar do
  `.png` convertido;
- `[Content_Types].xml` só pode ganhar a declaração da extensão jpeg (e
  perder `Override`s órfãos dos PNGs convertidos, se existirem);
- cada novo JPEG é reaberto com Pillow para conferir integridade;
- se qualquer verificação falhar, o arquivo gerado é descartado, uma cópia
  intacta do arquivo de entrada é colocada na saída, e a falha vai para o log.

### Uso (Windows)

Depois de já ter rodado `reduzir_docx.py`:

```bat
py converter_png_jpeg.py
```

Ou informando as pastas / processando só os arquivos que ainda estão acima
de 100 MB:

```bat
py converter_png_jpeg.py --entrada "C:\Temp\RNCs\Compactados" --saida "C:\Temp\RNCs\Compactados_v2"
py converter_png_jpeg.py --somente-grandes
```

O resultado vai para `C:\Temp\RNCs\Compactados_v2` por padrão (não
sobrescreve a saída da 1ª passada) e o log fica em
`log_conversao_png_jpeg.txt`.

## Extração de NCs para planilha: `extrair_ncs.py`

Extrai **todas as não conformidades (NCs)** dos relatórios anonimizados
(`.docx`) para uma única planilha Excel, **sem resumir nem reescrever nada**
(cópia literal do texto). Os relatórios são abertos somente para leitura.

Colunas geradas: `arquivo_origem`, `secao` (último título identificado —
alta/média/baixa tensão, subestação, quadro etc.), `descricao_nc`,
`itens_norma` (NR-10, NBR 5410, NBR 14039 etc.) e `solucao_proposta`.

Formatos reconhecidos automaticamente, arquivo a arquivo:

- **título por NC** (formato dos relatórios reais) — cada NC começa com um
  parágrafo de título (estilo "Título (1.1.1)" ou similar), seguido de
  "Descrição: …", "Foto:", "Embasamento na norma: …" e "Solução: …"; o
  título vira a 1ª linha da descrição e títulos de nível superior (ex.:
  "Documentais") viram a coluna `secao`;
- **tabela-matriz** — cabeçalho tipo "Item | Descrição da não conformidade |
  Embasamento | Solução proposta", uma NC por linha;
- **blocos rotulados** — "Não conformidade nº 01", "Descrição: …",
  "Norma/Embasamento: …", "Solução proposta/Recomendação: …", tanto em
  tabelas rótulo→valor quanto em parágrafos corridos.

Rótulos são reconhecidos sem diferenciar maiúsculas/acentos. Marcadores
"Foto:" e legendas ("Figura 35 – …") são pulados **sem interromper** o campo
em preenchimento — texto de descrição que continua depois de uma foto é
preservado.

Ao final, o console e o `log_extracao_ncs.txt` (gravado ao lado da planilha)
trazem o **total de NCs extraídas**, o **total por arquivo** e a lista de
arquivos a **conferir manualmente**: zero NCs encontradas, erro de leitura,
NCs com campo vazio ou arquivos que não são `.docx`.

### Uso (Windows)

Com os caminhos padrão (`C:\Temp\RNCs\Anonimizados` →
`C:\Temp\RNCs\Planilhas\Extracao_NCs_bruta.xlsx`):

```bat
py extrair_ncs.py
```

Ou informando os caminhos:

```bat
py extrair_ncs.py --entrada "C:\Temp\RNCs\Anonimizados" --saida "C:\Temp\RNCs\Planilhas\Extracao_NCs_bruta.xlsx"
```
