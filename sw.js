// Service Worker — cache completo para uso 100% offline.
// Ao publicar uma atualização, incremente VERSAO aqui e VERSAO_APP em js/versao.js.
const VERSAO = '1.5.0';
const NOME_CACHE = `aterramento-nord-v${VERSAO}`;

const ARQUIVOS = [
  './',
  'index.html',
  'manifest.json',
  'css/styles.css',
  'vendor/dexie.min.js',
  'vendor/jszip.min.js',
  'js/app.js',
  'js/db.js',
  'js/ui.js',
  'js/versao.js',
  'js/storage.js',
  'js/screens/inicio.js',
  'js/screens/home.js',
  'js/screens/novaInspecao.js',
  'js/screens/inspecoes.js',
  'js/screens/inspecao.js',
  'js/screens/escolherEquipamento.js',
  'js/screens/registro.js',
  'js/screens/exportar.js',
  'icons/logo-nord.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches
      .open(NOME_CACHE)
      .then((cache) => cache.addAll(ARQUIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) =>
        Promise.all(nomes.filter((nome) => nome !== NOME_CACHE).map((nome) => caches.delete(nome)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  if (evento.request.method !== 'GET') return;
  evento.respondWith(
    caches.match(evento.request, { ignoreSearch: true }).then(
      (resposta) =>
        resposta ||
        fetch(evento.request).then((respostaRede) => {
          // Guarda no cache respostas válidas da mesma origem.
          if (respostaRede.ok && new URL(evento.request.url).origin === location.origin) {
            const copia = respostaRede.clone();
            caches.open(NOME_CACHE).then((cache) => cache.put(evento.request, copia));
          }
          return respostaRede;
        })
    )
  );
});
