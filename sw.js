// Service worker : l'application s'ouvre même hors ligne, et chaque nouveau déploiement est récupéré automatiquement.
const V = 'patrimoine-fb-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest','config.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(K => Promise.all(K.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  if (r.mode === 'navigate' || u.pathname.endsWith('.html')) {
    // Réseau d'abord : la dernière version en ligne gagne ; le cache sert hors ligne.
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put('index.html', c)); return res; })
      .catch(() => caches.match('index.html')));
    return;
  }
  e.respondWith(caches.match(r).then(hit => {
    const net = fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
