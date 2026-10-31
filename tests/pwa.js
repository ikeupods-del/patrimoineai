// Application installable : manifeste (raccourcis, partage de fichiers), service worker réel (fichier partagé reçu puis importé),
// raccourcis ?action=…, carte « Revenus du mois » de l'accueil. node tests/pwa.js (Chromium de /opt/pw-browsers, serveur local)
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..'); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0].replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
(async () => {
  const M = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  ok(M.shortcuts.length === 4 && M.shortcuts.every(s => s.name && s.url.startsWith('./')) && M.share_target.method === 'POST' && M.share_target.params.files[0].name === 'fichier' && M.id === './', 'manifeste : raccourcis, partage de fichiers, identifiant');
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(base); await pg.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => pg.reload());
  await pg.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
  /* partage : un fichier envoyé par une autre application arrive au service worker, qui le garde puis ouvre l'import */
  const st = await pg.evaluate(async () => { const fd = new FormData(); fd.append('fichier', new File(['Nom;Valeur\nLivret partagé;1 234,50\n'], 'export-finary.csv', { type: 'text/csv' })); const r = await fetch('./partage', { method: 'POST', body: fd }); return { url: r.url, ok: r.ok, cache: !!(await (await caches.open('patrimoine-partage')).match('fichier')) }; });
  ok(st.ok && /\?action=partage(#assets)?$/.test(st.url) && st.cache, 'service worker : fichier partagé gardé, ouverture de l’import');
  await pg.goto(base + '?action=partage#assets'); await pg.waitForSelector('#ic-nom', { timeout: 8000 });
  ok(/export-finary\.csv/.test(await pg.textContent('#sheet')) && /Livret partagé/.test(await pg.textContent('#imp-ap')) && !/action=/.test(pg.url()) && !(await pg.evaluate(async () => !!(await (await caches.open('patrimoine-partage')).match('fichier')))), 'fichier partagé ouvert dans l’import, puis effacé de l’appareil ; adresse nettoyée');
  /* raccourcis de l'application installée */
  await pg.goto(base + '?action=ajouter#assets'); await pg.waitForTimeout(800); ok(await pg.evaluate(() => $('modal').classList.contains('open') && /Bourse/.test($('sheet').textContent)), 'raccourci « Ajouter un placement »');
  await pg.goto(base + '?action=importer#assets'); await pg.waitForTimeout(800); ok(await pg.locator('#imp-dz').count() === 1, 'raccourci « Importer »');
  /* accueil : revenus du mois et prochain versement */
  const carte = await pg.evaluate(() => { closeM(); const iso = k => { const d = new Date(); d.setMonth(d.getMonth() - k); return d.toLocaleDateString('sv-SE'); };
    D.assets = [{ id: 'p1', cat: 'crowd', name: 'Prêt Lyon', plat: 'Bienprêter', amount: 3000, value: 3000, rate: 8, dur: 36, date: iso(6), status: 'cours' }, { id: 'l1', cat: 'cash', name: 'Livret A', amount: 5000, rate: 2.4 }];
    D.rappels = [{ id: 'r1', nom: 'BienPrêter', jour: 5, aid: 'p1', dest: 'aucun', hist: {}, cree: '2000-01-01' }]; const m = moisCourant(), l = CL.ligneDuMois(echOf(D.assets[0]), m); rapValider('r1', m, l.total, { d: m + '-05' }); go('home'); render(); return $('v-home').textContent.replace(/[  ]/g, ' '); });
  ok(/Revenus (de |d’)/.test(carte) && /reçus sur .* de versements prévus/.test(carte) && /Prochain versement : BienPrêter/.test(carte), 'accueil : revenus du mois, part reçue, prochain versement');
  ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  console.log('application installable :', n, 'contrôles réussis'); await b.close(); srv.close();
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
