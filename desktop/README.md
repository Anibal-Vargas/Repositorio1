# App desktop — Relatórios de continuidade de aterramento (Nord Consult)

Aplicativo desktop (Windows) que recebe o pacote `.zip` de uma inspeção
exportada pelo PWA *"Medição de continuidade de aterramento elétrico de
máquinas e equipamentos"* e gera os documentos finais:

1. **Planilha resumo** das medições (`.xlsx`, a partir de um modelo);
2. **Laudo geral** da inspeção (`.docx` e `.pdf`, a partir de um modelo);
3. **Laudo individual** por máquina/equipamento (`.docx` e `.pdf`, um arquivo
   por máquina).

Os documentos são gravados numa **pasta de rede mapeada/compartilhada**
(ex.: `Z:\...` ou `\\servidor\pasta`). Tudo roda localmente, sem backend/nuvem.

## Decisões de projeto

- **Stack:** Python, empacotado como um único `.exe` (PyInstaller).
- **Saída:** planilha em `.xlsx`; laudos em `.docx` **e** `.pdf`.
- **Laudo individual:** um arquivo por máquina/equipamento.
- **Idioma:** pt-BR; nomes de funções/variáveis em português.
- **Identidade Nord Consult** (paleta e logo) nos documentos.

## Contrato de entrada (o `.zip` do PWA)

```
Fotos/
  <nome da máquina>/        ← ex.: "01 - Compressor 01" (UTF-8)
    01.jpg                  ← foto da máquina (obrigatória)
    02.jpg                  ← foto do valor medido (obrigatória)
    03.jpg                  ← foto da prancheta (opcional)
    04.jpg … 14.jpg         ← fotos adicionais (opcionais)
    resultado.txt           ← "conforme" | "não conforme"
    setor.txt               ← nome do setor (ex.: "Sala de máquinas")
    prolongador.txt         ← resistência do prolongador em mΩ (ex.: "0,2")
    observação.txt          ← opcional
    áudio.webm              ← opcional (.webm/.ogg/.m4a)
relatorio.html              ← referência de layout
dados.json                  ← dados estruturados (pode vir VAZIO)
```

O leitor usa `dados.json` como fonte principal (traz cliente, inspetor, data,
setor, resultado, observação e a relação de fotos). O `prolongador` **não** está
no `dados.json` — vem sempre do `prolongador.txt` de cada pasta (decimal pt-BR,
`0,2`). Se o `dados.json` estiver ausente/ inválido, o leitor cai para a
varredura das pastas `Fotos/` (`resultado.txt`, `setor.txt`, `prolongador.txt`,
`observação.txt`).

O **valor medido (mΩ)** agora vem no pacote (`.zip`) — o leitor procura o campo
no `dados.json` (ex.: `valorMedido`) ou um arquivo de texto por pasta; no app
o valor fica editável para conferência. Os dados fixos do laudo que não vêm no
pacote (contratante, nº da proposta, cidade, engenheiro, imagens, data da
inspeção) vêm da **configuração** preenchida uma vez.

Uma máquina é **OK** apenas com as fotos 01 e 02 e o resultado marcado; caso
contrário é **Pendente** (sinalizado nos relatórios).

## Estrutura do projeto

```
desktop/
  aterramento/            pacote Python
    modelo.py             estruturas de dados (Cliente, Inspecao, Equipamento…)
    leitor.py             lerPacote(): .zip -> modelo de dados
    configuracao.py       dados fixos preenchidos uma vez (JSON)
    planilha.py           gerarPlanilhaResumo(): .xlsx a partir do modelo
    laudos.py             gerarLaudoGeral() / gerarLaudosIndividuais(): .docx
    geracao.py            gerar_todos(): orquestra tudo numa pasta
    app.py                interface Tkinter
  iniciar_app.py          lançador do app (python iniciar_app.py)
  conferir.py             CLI de conferência da leitura (Etapa 1)
  ferramentas/
    gerar_exemplo.py      gera um .zip de exemplo para testes
  modelos/                modelos .xlsx/.docx do cliente
  requirements.txt
```

**Dependências:** `pip install -r requirements.txt`. O `tkinter` acompanha o
Python no Windows (no Linux: `apt install python3-tk`).

## Como usar o app

```bash
cd desktop
python iniciar_app.py
```

1. **Configuração** (uma vez): preencha data da inspeção, unidade, cidade,
   engenheiro/CREA, as **imagens** (logo do cliente, equipamento, selo de
   calibração) e as datas da calibração. Fica salvo em
   `~/.aterramento/config.json`.
2. **Abrir pacote (.zip)** da inspeção. O app mostra um resumo (somente
   leitura) das máquinas com valor medido, prolongador, resistência efetiva e
   a adequação — tudo já vem do pacote, nada precisa ser digitado.
3. **Gerar documentos** e escolha a pasta (pode ser a pasta de rede). Saem a
   planilha, o laudo geral e os laudos individuais organizados em subpasta.

## Como testar a leitura (Etapa 1)

```bash
cd desktop
python -m ferramentas.gerar_exemplo          # cria exemplos/aterramento-...zip
python conferir.py exemplos/aterramento-metalurgica-exemplo-2026-07-21.zip
```

A conferência imprime cliente, inspeção, resumo (conforme / não conforme /
pendentes) e a lista de máquinas por setor, com as pendências.

## Roadmap por etapas

- [x] **Etapa 1 — Leitor do pacote** (`.zip` → modelo de dados + conferência).
- [x] **Etapa 2 — Planilha resumo** (`.xlsx`) — clona o modelo e preenche
  cabeçalho (Local/Data) e uma linha por máquina, preservando fórmulas
  (efetiva/adequado) e a formatação condicional. Valor medido e prolongador
  entram como parâmetros; o valor medido vem do pacote (`.zip`).
- [x] **Etapa 3 — Laudo geral** (`.docx`): `laudos.gerarLaudoGeral()` preenche
  o modelo substituindo os campos variáveis (contratante, proposta, cidade,
  data, engenheiro) vindos da `Configuracao` (preenchida uma vez) + data da
  inspeção, preservando figuras, metodologia, normas e os dados fixos da Nord.
- [x] **Etapa 4 — Laudo individual** por máquina (`.docx`):
  `laudos.gerarLaudoIndividual()` / `gerarLaudosIndividuais()` preenchem o
  modelo com valor medido / prolongador / resistência efetiva, definem a
  conclusão **ESTÁ / NÃO ESTÁ** pela efetiva (≤ 1000 mΩ) e **inserem as fotos**
  01 (equipamento) e 02 (valor), preservando as figuras fixas. Um arquivo por
  máquina.
- [x] **Etapa 5 — Gravação na pasta escolhida** + estrutura de saída:
  `geracao.gerar_todos()` monta, numa subpasta `<cliente> - <data>`, a planilha
  resumo, o laudo geral e os laudos individuais (em `Laudos Individuais/`). A
  pasta de destino é escolhida pelo operador a cada inspeção (inclusive pasta
  de rede mapeada).
- [x] **Etapa 6a — Tela do app (Tkinter)**: `aterramento/app.py` — configuração
  (dados fixos + imagens: logo, equipamento, selo, datas de calibração),
  abertura do `.zip`, cabeçalho editável, e por máquina o display ampliado +
  valor medido (confirmável) com prolongador/resultado pré-preenchidos; gera e
  salva na pasta escolhida. Rodar com `python iniciar_app.py`.
- [x] **Etapa 6b — PDF + empacotamento `.exe`**:
  - **PDF** (`aterramento/pdf.py`): converte os documentos gerados marcando
    "Gerar também em PDF" no app. Usa o MS Word/Excel (via `pywin32`) quando
    instalados; senão, o LibreOffice (`soffice`). Se nenhum existir, os
    documentos Word/Excel saem normalmente e o PDF é apenas pulado.
  - **`.exe`** (`construir_exe.bat`): empacota o app num executável único com
    PyInstaller (inclui os modelos e o logo). Rodar o `.bat` no Windows gera
    `dist\RelatoriosAterramento.exe`.

## Gerar o executável (.exe) e o PDF

- **PDF**: no app, marque **"Gerar também em PDF"** antes de gerar. Para
  funcionar, o Windows precisa ter **Word/Excel** (e `pip install pywin32`) ou
  o **LibreOffice** (gratuito) instalado.
- **.exe**: dê duplo clique em `construir_exe.bat` dentro da pasta `desktop`
  (requer Python instalado). Ao final, o executável fica em
  `dist\RelatoriosAterramento.exe` e roda sem precisar de Python.

> Para as Etapas 2–4 são necessários os **modelos** do cliente
> (planilha resumo, laudo geral, laudo individual). Coloque-os em
> `desktop/modelos/`.
