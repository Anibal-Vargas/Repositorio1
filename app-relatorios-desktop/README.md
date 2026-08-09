# Relatórios de Inspeção — NORD CONSULT

Aplicativo desktop que transforma pacotes `.zip` do aplicativo de campo em
planilhas e relatórios de inspeção elétrica (NR-10).

## Rodar

**Windows:** duplo clique em `Abrir aplicativo.bat`
**Qualquer sistema:** abra `index.html` no Google Chrome

Não precisa instalar nada, nem internet, nem servidor.

## Testar

```bash
node testes/verificar.mjs
```

12 verificações, sem `npm install`. Rode antes e depois de qualquer alteração
no gerador.

## Documentação

| Arquivo | Conteúdo |
|---|---|
| `CLAUDE.md` | Contexto completo do projeto. **Comece por aqui.** |
| `LEIA-ME.txt` | Instruções para o usuário final |
| `docs/arquitetura.md` | Decisões de stack e alternativas descartadas |
| `docs/especificacao-planilha-paineis.md` | Mapeamento de colunas e defeitos conhecidos |
| `docs/modelo-original.xlsx` | A planilha modelo, para conferência |

## Estado

- ✅ Planilha de painéis — pronta, validada com dados reais de produção
- ✅ Pacotes divididos em partes — detecção e mesclagem
- ⏳ Relatório de não conformidades (Word + PDF) — não iniciado
- ⏳ Alinhamento visual com o aplicativo de campo — aguardando o CSS
