// Service Worker — cache offline-first de todos os assets do app.
// Para publicar uma atualização, incremente VERSAO: o SW novo instala,
// assume imediatamente (skipWaiting) e a página recarrega sozinha.
const VERSAO = 'v1.2.0';
const CACHE = `inspecoes-${VERSAO}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './vendor/dexie.min.js',
  './vendor/jszip.min.js',
  './js/app.js',
  './js/db.js',
  './js/ui.js',
  './js/storage.js',
  './js/camera.js',
  './js/audio.js',
  './js/screens/identificacao.js',
  './js/screens/home.js',
  './js/screens/novaInspecao.js',
  './js/screens/inspecao.js',
  './js/screens/nc.js',
  './js/screens/retomar.js',
  './icons/logo-nord.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  evento.respondWith(
    caches.match(request, { ignoreSearch: true }).then((emCache) => {
      if (emCache) return emCache;
      return fetch(request)
        .then((resposta) => {
          if (resposta.ok) {
            const copia = resposta.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copia));
          }
          return resposta;
        })
        .catch(() => {
          // Offline e fora do cache: navegações voltam ao shell do app.
          if (request.mode === 'navigate') return caches.match('./index.html');
          return Response.error();
        });
    })
  );
});
