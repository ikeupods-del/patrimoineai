// Service worker : l'application s'ouvre même hors ligne, et chaque nouveau déploiement est récupéré automatiquement.
const V = 'patrimoine-fb-v8';
const ETAT = 'patrimoine-etat'; // dates des versements attendus, écrites par la page (aucun montant)
const CORE = ['./', 'index.html', 'conditions.html', 'manifest.webmanifest','config.js', 'marches.js', 'calculs.js', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(K => Promise.all(K.filter(k => k !== V && k !== ETAT).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
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

/* Rappels de versement application fermée : vérification périodique (application installée, Chrome ou Edge) et notification push
   (sans contenu : le texte est composé ici, d'après les dates gardées sur l'appareil). Une notification par jour au plus. */
async function montrerRappels(pousse) {
  const c = await caches.open(ETAT), auj = new Date().toLocaleDateString('sv-SE');
  let E = null, vu = '';
  try { const r = await c.match('etat-rappels'); E = r ? await r.json() : null; const n = await c.match('notifie'); vu = n ? await n.text() : ''; } catch (e) { /* rien de connu */ }
  const L = ((E && E.items) || []).filter(x => x && x.date && x.date <= auj), jours = x => Math.round((Date.parse(auj) - Date.parse(x.date)) / 864e5);
  if (!pousse && (vu === auj || !L.length)) return;
  const pire = L.some(x => jours(x) > 10) ? 'Versement manquant' : L.some(x => jours(x) > 3) ? 'Versement en retard' : 'Versement attendu';
  const noms = [...new Set(L.map(x => x.nom))];
  await c.put('notifie', new Response(auj));
  return self.registration.showNotification(L.length ? pire + ' : ' + noms.slice(0, 3).join(', ') : 'Patrimoine AI', {
    body: L.length ? 'Ouvrez Patrimoine AI pour confirmer s’il est arrivé.' : 'Pensez à vérifier vos versements attendus.',
    icon: 'icon-192.png', badge: 'icon-192.png', tag: 'rappels', data: { url: './#home' } });
}
self.addEventListener('periodicsync', e => { if (e.tag === 'rappels') e.waitUntil(montrerRappels(false)); });
self.addEventListener('push', e => { e.waitUntil(montrerRappels(true)); });
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const u = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(L => {
    const w = L.find(x => x.url.startsWith(self.registration.scope));
    if (w) return w.focus().then(f => f && f.navigate ? f.navigate(u) : f).catch(() => w.focus());
    return self.clients.openWindow(u);
  }));
});
