# Inspeções de conformidade Técnica/NR-10 – Nord Consult — PWA offline-first

Aplicativo de campo para registro de não conformidades (NCs) em inspeções de
conformidade técnica/NR-10. 100% offline após o primeiro carregamento, sem
backend: todos os dados (fotos, áudios, texto) ficam no IndexedDB do
dispositivo.

Identidade visual: fundo branco com a logo Nord Consult centralizada como
marca-d'água e paleta laranja da marca. A logo em `icons/logo-nord.png` é uma
recriação vetorial aproximada — para usar a arte oficial, substitua esse
arquivo pelo PNG original (mesmo nome, fundo transparente) e incremente
`VERSAO` em `sw.js`.

## Estado atual (Fases 1, 2 e 3 concluídas)

- **PWA instalável**: `manifest.json`, Service Worker com pré-cache de todos os
  assets e atualização automática (incremente `VERSAO` em `sw.js` ao publicar).
- **Home**: Nova inspeção / Retomar inspeção / Exportar + espaço de
  armazenamento usado.
- **Nova inspeção** em tela única: inspetor (lista suspensa com a equipe
  Nord Consult + opção de digitar outro nome), cliente (lista suspensa +
  cadastro) e tipo (Geral funcional; Subestações, Painéis e Documental
  chegam na Fase 4). O inspetor escolhido vem pré-selecionado na próxima.
- **Inspeção Geral**: áreas e sub-áreas (1 nível), NCs com numeração
  sequencial (NC-001, NC-002…), até 20 fotos por NC (câmera nativa via
  `input capture`, compressão Canvas para máx. 1920px / JPEG 0.8), descrição
  opcional com salvamento automático e áudios opcionais (MediaRecorder).
- **Retomar** lista inspeções abertas com progresso (áreas, NCs, fotos).
- **Exportar**: pacote .zip por inspeção no padrão de importação
  `NCs/AA-MM-DD/<Área>/[<Sub-área>/]NC-XXX/` com `NC-XXX_foto01.jpg`,
  `NC-XXX_audio01.webm` e `NC-XXX_desc01.txt` (data = registro da NC), mais
  `relatorio.html` (relatório legível com fotos) e `dados.json`
  (estruturado) na raiz. No Android abre a folha de compartilhamento
  (WhatsApp, Drive, e-mail…); sem suporte, baixa o arquivo. Também permite
  finalizar e reabrir inspeções.
- `navigator.storage.persist()` solicitado na primeira abertura da Home.

Fluxo de campo: dentro de uma área, **NC + FOTO** → disparo da câmera →
confirmar = 3 toques, com tudo salvo automaticamente.

## Estrutura

```
app_inspecoes/
├── index.html          # shell único (SPA com rotas por hash)
├── manifest.json       # manifesto PWA (pt-BR, standalone)
├── sw.js               # service worker (cache offline + auto-atualização)
├── icons/              # ícones gerados (192/512 + maskable)
├── vendor/             # dexie.min.js e jszip.min.js vendorizados (sem CDN)
├── css/styles.css      # estilos (botões ≥48px, alto contraste)
└── js/
    ├── app.js          # roteador + registro do service worker
    ├── db.js           # esquema Dexie e acesso a dados
    ├── camera.js       # captura + compressão de fotos
    ├── audio.js        # gravação de áudio (MediaRecorder)
    ├── storage.js      # persistência e estimativa de espaço
    ├── ui.js           # utilitários de interface
    └── screens/        # uma tela por arquivo
```

## Como testar no celular (rede local)

1. No computador, dentro desta pasta:
   ```bash
   cd app_inspecoes
   python3 -m http.server 8000
   ```
2. Descubra o IP do computador na rede (`ip addr` ou `ipconfig`) e abra no
   Chrome do celular: `http://SEU_IP:8000`.
3. **Atenção**: fora de `localhost`, Service Worker e câmera/microfone exigem
   HTTPS. Para teste completo no celular use uma destas opções:
   - **Encaminhamento de porta do Chrome** (recomendado): celular via USB,
     `chrome://inspect` → *Port forwarding* → `8000 → localhost:8000`; no
     celular abra `http://localhost:8000` (localhost é considerado seguro).
   - **GitHub Pages** ou outro host HTTPS estático (o app é 100% estático).
4. No Chrome do celular: menu ⋮ → **Instalar app** (ou "Adicionar à tela
   inicial"). Instalado, ative o modo avião e confira que tudo funciona.

## Publicar atualização

Edite os arquivos e **incremente `VERSAO` em `sw.js`**. Na próxima abertura
com rede, o app baixa a versão nova e recarrega sozinho.

## Pendente (Fases 4–5)

- **Fase 4 — Demais tipos**: Subestações, Painéis e Documental (checklists
  específicos).
- **Fase 5 — Refinamentos**: edição/exclusão de áreas e clientes, busca,
  relatório formatado, importação em outro dispositivo.
