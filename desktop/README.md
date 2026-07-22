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
  <nome da máquina>/        ← ex.: "01 - Prensa hidráulica PH-01" (UTF-8)
    01.jpg                  ← foto da máquina (obrigatória)
    02.jpg                  ← foto do valor medido (obrigatória)
    03.jpg                  ← foto da prancheta (opcional)
    04.jpg … 14.jpg         ← fotos adicionais (opcionais)
    resultado.txt           ← "conforme" | "não conforme"
    áudio.webm              ← opcional (.webm/.ogg/.m4a)
    observação.txt          ← opcional
relatorio.html              ← referência de layout
dados.json                  ← fonte estruturada preferencial
```

O leitor usa `dados.json` como fonte principal e as pastas `Fotos/` para
localizar imagens/áudios. Uma máquina é **OK** apenas com as fotos 01 e 02 e o
resultado marcado; caso contrário é **Pendente** (sinalizado nos relatórios).

## Estrutura do projeto

```
desktop/
  aterramento/            pacote Python
    modelo.py             estruturas de dados (Cliente, Inspecao, Equipamento…)
    leitor.py             lerPacote(): .zip -> modelo de dados
    planilha.py           gerarPlanilhaResumo(): .xlsx a partir do modelo
    logo-nord.png         marca para os documentos
  conferir.py             CLI de conferência da leitura (Etapa 1)
  ferramentas/
    gerar_exemplo.py      gera um .zip de exemplo para testes
  modelos/                (a preencher) modelos .xlsx/.docx do cliente
  requirements.txt
```

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
  entram como parâmetros (origem definida nas próximas etapas).
- [ ] **Etapa 3 — Laudo geral** (`.docx`/`.pdf`) a partir do modelo.
- [ ] **Etapa 4 — Laudo individual** por máquina (`.docx`/`.pdf`).
- [ ] **Etapa 5 — Gravação na pasta de rede** + estrutura de saída.
- [ ] **Etapa 6 — Empacotamento `.exe`** (Windows) + conversão para PDF.

> Para as Etapas 2–4 são necessários os **modelos** do cliente
> (planilha resumo, laudo geral, laudo individual). Coloque-os em
> `desktop/modelos/`.
