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
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://localhost:' + srv.address().port + '/'; /* « localhost » : nom de site accepté par WebAuthn (pas une adresse IP) */
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
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
  /* verrouillage web : Face ID / empreinte (capteur simulé), secours par code, réglage du délai */
  const cdp = await ctx.newCDPSession(pg); await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', { options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });
  await pg.evaluate(() => { localStorage.removeItem('pat_pass'); go('set'); }); await pg.click('[data-act=tog][data-k=verrou]');
  ok(await pg.locator('#vw-c').count() === 1, 'activation : code de secours demandé (pas de phrase secrète)');
  await pg.fill('#vw-c', 'abc'); await pg.click('[data-act=vwgo]'); ok(/6 caractères/.test(await pg.textContent('#vw-e')), 'code de secours trop court refusé');
  await pg.fill('#vw-c', 'secours-123'); await pg.click('[data-act=vwgo]'); await pg.waitForFunction(() => !!VW.get(), null, { timeout: 8000 });
  ok(await pg.evaluate(() => { const v = VW.get(); return v.id.length > 10 && v.min === 5 && v.h && !/secours/.test(JSON.stringify(v)); }), 'clé d’accès créée sur l’appareil, code de secours gardé sous forme d’empreinte');
  await pg.click('[data-act=vwnow]'); ok(await pg.evaluate(() => document.body.classList.contains('locked') && getComputedStyle(document.querySelector('.app')).visibility === 'hidden'), 'verrouillé : contenu masqué');
  await pg.click('#unl'); await pg.waitForFunction(() => !document.body.classList.contains('locked'), null, { timeout: 8000 }); ok(true, 'déverrouillé par Face ID / empreinte');
  await pg.evaluate(() => vwVerrouiller()); await pg.click('[data-act=vwsec]'); await pg.fill('#vw-p', 'mauvais'); await pg.click('[data-act=vwsecok]'); await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => document.body.classList.contains('locked')) && /pas le bon code/.test(await pg.textContent('#vw-pe')), 'secours : mauvais code refusé');
  await pg.fill('#vw-p', 'secours-123'); await pg.click('[data-act=vwsecok]'); await pg.waitForFunction(() => !document.body.classList.contains('locked'), null, { timeout: 8000 }); ok(true, 'secours : bon code accepté');
  await pg.evaluate(() => go('set')); await pg.click('[data-act=vwmin][data-v="1"]'); ok(await pg.evaluate(() => VW.get().min === 1), 'délai de verrouillage réglable');
  await pg.reload(); await pg.waitForFunction(() => typeof D !== 'undefined'); ok(await pg.evaluate(() => document.body.classList.contains('locked')), 'verrouillé à l’ouverture');
  await pg.evaluate(() => { vwLibre(); VW.set(null); });
  /* installation proposée (invite du navigateur simulée), refus mémorisé */
  const ins = await pg.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => { window.__p = 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); go('home'); render(); return { home: !!document.querySelector('#v-home [data-act=inst]'), set: (go('set'), !!document.querySelector('#v-set [data-act=inst]')) }; });
  ok(ins.home && ins.set, 'installation proposée sur l’accueil et dans les réglages');
  await pg.click('#v-set [data-act=inst]'); await pg.waitForTimeout(200); ok(await pg.evaluate(() => window.__p === 1 && !INST.evt), 'invite d’installation ouverte');
  /* données d'une version avec liaison bancaire : comptes gardés en suivi manuel, liaison oubliée, opérations conservées (schéma 3) */
  const mig = await pg.evaluate(() => { const old = { sv: 2, assets: [{ id: 'bqa', cat: 'cash', name: 'Compte courant', amount: 1200, value: 1200, bq: 'c1', bqAt: 1 }], bank: { liee: 1, banque: 'Boursorama', comptes: [] }, ops: [{ id: 'o1', d: '2026-10-02', lib: 'CB', m: -5, cat: 'autre', fid: 'eb:c1:t1' }], mt: { bank: 5 } };
    const d = migrate(JSON.parse(JSON.stringify(old))); return { sv: d.sv, bank: 'bank' in d, bq: d.assets[0].bq, val: d.assets[0].value, ops: d.ops.length, mt: 'bank' in d.mt, sf: SF.includes('bank'), p: 'bank' in payload() }; });
  ok(mig.sv === 3 && !mig.bank && !mig.bq && mig.val === 1200 && mig.ops === 1 && !mig.mt && !mig.sf && !mig.p, 'ancienne liaison bancaire : comptes en suivi manuel, plus aucune donnée bancaire synchronisée (' + JSON.stringify(mig) + ')');
  ok(await pg.evaluate(() => { go('bank'); const t = $('v-bank').textContent; return /Rappels de paiement/.test(t) && /Comptes bancaires/.test(t) && !/Enable Banking|Lier ma banque/.test(t) && TITLES.bank === 'Mes versements'; }), 'écran Mes versements : rappels, sans liaison bancaire');
  /* premier lancement sur un nouvel appareil : retrouver ses données */
  ok(await pg.evaluate(() => { const A = D.assets; D.assets = []; renderHome(); const t = $('v-home').textContent; D.assets = A; return /Vous utilisiez Patrimoine AI sur un autre appareil/.test(t) && /Retrouver mes données/.test(t); }), 'nouvel appareil : « Retrouver mes données » proposé');
  ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  console.log('application installable :', n, 'contrôles réussis'); await b.close(); srv.close();
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
