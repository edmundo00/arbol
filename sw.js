// Para que la aplicación abra sin conexión (sobre todo en el móvil): guarda en el aparato los archivos del programa,
// nunca los datos (el GEDCOM y las fotos los elige cada uno y no pasan por aquí).
// publicar.py cambia VERSION y la lista ARCHIVOS en cada publicación.
const VERSION = '202611050832';
const ARCHIVOS = ['app.css?v=202611050832', 'variantes.json?v=202611050832', 'manifest.webmanifest', 'icono-192.png', 'icono-512.png', 'js/almacen.js?v=202611050832', 'js/app.js?v=202611050832', 'js/arboles.js?v=202611050832', 'js/buscar.js?v=202611050832', 'js/consulta.js?v=202611050832', 'js/copias.js?v=202611050832', 'js/editar.js?v=202611050832', 'js/estadisticas.js?v=202611050832', 'js/exportar.js?v=202611050832', 'js/fechas.js?v=202611050832', 'js/formularios.js?v=202611050832', 'js/gedcom.js?v=202611050832', 'js/guardar.js?v=202611050832', 'js/imprimir.js?v=202611050832', 'js/investigar.js?v=202611050832', 'js/md.js?v=202611050832', 'js/menciones.js?v=202611050832', 'js/modelo.js?v=202611050832', 'js/mural.js?v=202611050832', 'js/nombresdb.js?v=202611050832', 'js/partida.js?v=202611050832', 'js/registro.js?v=202611050832', 'js/revisar.js?v=202611050832', 'js/salud.js?v=202611050832', 'js/textolibre.js?v=202611050832', 'js/vistas.js?v=202611050832', 'vendor/sqljs/sql-wasm.js', 'vendor/sqljs/sql-wasm.wasm'];
const CACHE = 'arbol-' + VERSION;
const BASE = new URL('./', self.location).href;

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', ...ARCHIVOS])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('arbol-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', ev => {
  const r = ev.request;
  if (r.method !== 'GET' || !r.url.startsWith(BASE)) return;          // solo los archivos del programa
  const u = new URL(r.url);
  if (u.searchParams.has('v') || u.pathname.includes('/vendor/')) {
    // Con número de versión: no cambian nunca, primero lo guardado
    ev.respondWith(caches.match(r).then(g => g || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })));
  } else {
    // La página y lo demás: primero la red (para ver enseguida la versión nueva), y sin conexión, lo guardado
    ev.respondWith(fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(k => k.put(r, c)); } return res; })
      .catch(() => caches.match(r, { ignoreSearch: r.mode === 'navigate' }).then(g => g || caches.match('./'))));
  }
});
