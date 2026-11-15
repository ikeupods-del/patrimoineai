// Application sur iPhone (écran tactile, Safari installé simulé) : plein écran, raccourcis, bouton +, pastille, geste retour,
// fenêtre glissée vers le bas, tirer pour actualiser, partage des fichiers, clavier numérique. Les données ne changent pas.
// node tests/iphone.js   (Chromium de /opt/pw-browsers, serveur local)
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..'); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0].replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); });
(async () => {
  // fichiers : balises iPhone, icône, écrans de lancement publiés et gardés hors ligne
  const H = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), liens = [...H.matchAll(/apple-touch-startup-image"[^>]*href="([^"]+)"/g)].map(m => m[1]);
  ok(/apple-mobile-web-app-capable" content="yes"/.test(H) && /status-bar-style" content="black-translucent"/.test(H) && /viewport-fit=cover/.test(H), 'plein écran iPhone déclaré');
  ok(liens.length >= 10 && liens.every(l => fs.existsSync(path.join(ROOT, l))) && fs.existsSync(path.join(ROOT, 'icon-180.png')), 'écrans de lancement et icône 180 px présents');
  ok(/icon-180\.png/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')) && /cp -r vendor splash _site/.test(fs.readFileSync(path.join(ROOT, '.github/workflows/pages.yml'), 'utf8')), 'icône en cache, écrans de lancement publiés');

  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.route(/corsproxy|allorigins|gstatic|googleapis|firebase|yahoo|binance/, r => r.abort());
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await ctx.addInitScript(() => {
    window.__badge = []; window.__part = [];
    navigator.setAppBadge = x => { window.__badge.push(x); return Promise.resolve(); }; navigator.clearAppBadge = () => { window.__badge.push(0); return Promise.resolve(); };
    navigator.canShare = o => !!(o && o.files && o.files.length); navigator.share = o => { window.__part.push(o.files[0].name); return Promise.resolve(); };
    Object.defineProperty(navigator, 'standalone', { get: () => true });
    if (!localStorage.getItem('pat_data')) localStorage.setItem('pat_data', JSON.stringify({ assets: [
      { id: 'a1', cat: 'cash', name: 'Livret A', amount: 5000 }, { id: 'a2', cat: 'crowd', name: 'Projet Lilas', plat: 'Bricks', amount: 3000, value: 3000, rate: 9, dur: 24, date: '2025-03-01', status: 'cours' }],
      rappels: [{ id: 'r1', nom: 'Bricks', jour: 1, attendu: '', aid: '', dest: 'plateforme', cpt: '', motif: 'bricks', cree: '2025-01-01', hist: {}, actif: true }], set: { theme: 'dark' } }));
  });
  await pg.goto(base); await pg.waitForFunction(() => typeof tactInit === 'function' && document.querySelector('#v-home .hero'));
  const avant = await pg.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('pat_data')).assets));
  ok(await pg.evaluate(() => document.documentElement.classList.contains('iossa') && TACT && IOS), 'application installée sur iPhone reconnue');
  ok(await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth && $('content').scrollWidth <= $('content').clientWidth), 'aucun débordement horizontal sur l’accueil (375 px)');

  // raccourcis de l'accueil, pastille des versements à confirmer
  const dus = await pg.evaluate(() => rapDus().length);
  ok(new Date().getDate() < 5 || dus >= 1, 'un versement est à confirmer');
  ok(await pg.locator('.qa button').count() === 5, 'cinq raccourcis sur l’accueil');
  ok(await pg.evaluate(d => { const t = $('tmore'), q = document.querySelector('.qa [data-v=bank]'); return d ? t.dataset.n == d && q.dataset.n == d && window.__badge.includes(d) : !t.dataset.n && !q.dataset.n; }, dus), 'pastille sur « Plus », sur le raccourci et sur l’icône');
  await pg.tap('.qa [data-v=rev]'); ok(await pg.evaluate(() => UI.view === 'rev' && location.hash === '#rev'), 'raccourci Revenus');

  // bouton + seulement là où il sert
  const fab = () => pg.evaluate(() => getComputedStyle($('fab')).display !== 'none');
  ok(!(await fab()), 'pas de bouton + sur les revenus'); await pg.evaluate(() => go('analyse')); ok(!(await fab()), 'pas de bouton + sur l’analyse');
  await pg.evaluate(() => go('assets')); ok(await fab(), 'bouton + sur les placements'); await pg.evaluate(() => go('home')); ok(await fab(), 'bouton + sur l’accueil');

  // geste retour : ferme la fenêtre ouverte, sans changer d'écran
  const ouvert = () => pg.evaluate(() => $('modal').classList.contains('open'));
  await pg.tap('#tmore'); ok(await ouvert() && await pg.evaluate(() => HIST.fen), 'fenêtre « Plus » ouverte, inscrite dans l’historique');
  await pg.goBack(); await pg.waitForTimeout(200); ok(!(await ouvert()) && await pg.evaluate(() => UI.view === 'home'), 'retour : la fenêtre se ferme, l’accueil reste');
  // fenêtre fermée par la croix puis retour : écran précédent
  await pg.tap('#tmore'); await pg.tap('#sheet [data-act=closeM]'); await pg.waitForTimeout(700);
  ok(!(await ouvert()) && await pg.evaluate(() => !HIST.fen && !HIST.retour && UI.view === 'home'), 'fermée par la croix : historique remis en ordre');
  await pg.goBack(); await pg.waitForTimeout(200); ok(await pg.evaluate(() => UI.view === 'assets'), 'retour suivant : écran précédent (placements)');
  // choix dans la fenêtre : l'écran change, puis retour revient d'où l'on vient
  await pg.tap('#tmore'); await pg.tap('#sheet [data-v=mk]'); await pg.waitForTimeout(700);
  ok(!(await ouvert()) && await pg.evaluate(() => UI.view === 'mk' && location.hash === '#mk' && !HIST.retour), 'choix dans « Plus » : écran Marchés, adresse à jour');
  await pg.goBack(); await pg.waitForTimeout(200); ok(await pg.evaluate(() => UI.view === 'assets'), 'retour depuis Marchés : écran d’avant');
  // deux fenêtres à la suite (fiche puis formulaire) : une seule entrée, retour ferme
  await pg.evaluate(() => { openDetail('a2'); closeM(); openForm('cash'); }); await pg.waitForTimeout(700);
  ok(await ouvert() && await pg.evaluate(() => HIST.fen && !HIST.retour), 'fenêtre rouverte aussitôt : toujours dans l’historique');

  // clavier numérique pour les montants
  await pg.evaluate(() => { const i = document.querySelector('#sheet input[type=number]'); i.removeAttribute('inputmode'); i.focus(); });
  ok(await pg.evaluate(() => document.activeElement.getAttribute('inputmode') === 'decimal'), 'pavé numérique avec virgule sur un montant');
  await pg.evaluate(() => document.activeElement.blur());

  // glisser l'en-tête de la fenêtre vers le bas la ferme
  const glisser = (sel, dy) => pg.evaluate(([sel, dy]) => { const el = document.querySelector(sel), r = el.getBoundingClientRect(), x = r.left + 40, y = r.top + 12;
    const T = (type, yy) => { const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: yy }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
    T('touchstart', y); for (let k = 1; k <= 6; k++) T('touchmove', y + dy * k / 6); T('touchend', y + dy); }, [sel, dy]);
  await glisser('#sheet .sh h2', 40); await pg.waitForTimeout(350); ok(await ouvert(), 'petit glissement : la fenêtre reste');
  await glisser('#sheet .sh h2', 180); await pg.waitForTimeout(900); ok(!(await ouvert()), 'grand glissement vers le bas : la fenêtre se ferme');

  // tirer vers le bas actualise
  await pg.evaluate(() => { go('home'); window.__act = 0; const f = actualiserTout; window.actualiserTout = function () { window.__act++; return f(); }; });
  await pg.evaluate(() => { const el = $('content'), T = (type, y) => { const t = new Touch({ identifier: 2, target: el, clientX: 150, clientY: y }); el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t], changedTouches: [t] })); };
    T('touchstart', 200); for (let k = 1; k <= 7; k++) T('touchmove', 200 + 20 * k); T('touchend', 340); });
  await pg.waitForFunction(() => /Actualisé|Hors ligne/.test($('toast').textContent), null, { timeout: 12000 });
  ok(await pg.evaluate(() => !$('ptr').classList.contains('go')), 'tirer vers le bas : actualisation lancée puis terminée');

  // partage des fichiers : sauvegarde et CSV par la feuille de partage, calendrier par téléchargement
  await pg.evaluate(() => { dl('patrimoine-test.json', '{}', 'application/json'); dl('test.csv', 'a;b', 'text/csv'); });
  ok(JSON.stringify(await pg.evaluate(() => window.__part)) === '["patrimoine-test.json","test.csv"]', 'sauvegarde et CSV proposés au partage (Fichiers, AirDrop)');
  const [tele] = await Promise.all([pg.waitForEvent('download'), pg.evaluate(() => dl('paiements.ics', 'BEGIN:VCALENDAR', 'text/calendar'))]);
  ok(tele.suggestedFilename() === 'paiements.ics' && (await pg.evaluate(() => window.__part.length)) === 2, 'calendrier : fichier ouvert directement');

  // toucher le titre remonte en haut
  await pg.evaluate(() => { $('content').style.scrollBehavior = 'auto'; $('content').scrollTop = 600; }); await pg.tap('.ttlw'); await pg.waitForTimeout(700);
  ok(await pg.evaluate(() => $('content').scrollTop < 5), 'toucher le titre remonte en haut de l’écran');

  // rien n'a changé dans les placements enregistrés
  ok(await pg.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('pat_data')).assets)) === avant, 'placements enregistrés inchangés');
  ok(!errs.length, 'aucune erreur dans la page : ' + errs.join(' | '));
  console.log('iPhone : ' + n + ' contrôles réussis'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
