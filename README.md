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
