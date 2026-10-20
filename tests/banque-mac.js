// Liaison bancaire de l'application Mac, sans serveur : le vrai module mac/banque-locale.js (banque de démonstration, coffre simulé)
// derrière un serveur local, la page avec un pont Mac simulé. Parcours : mise en route, démonstration, liaison par le navigateur
// (retour sur 127.0.0.1), soldes dans le patrimoine, opérations dans le budget, clé .pem, diagnostic, renvoi depuis la page en ligne.
// node tests/banque-mac.js   (Chromium de /opt/pw-browsers)
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };

(async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'pat-banque-'));
  let lie = 0;
  const B = require('../mac/banque-locale').creer({ dossier, racine: path.join(ROOT, 'banque'), coffre: { chiffrer: t => Buffer.from('trousseau:' + t), dechiffrer: b => b.toString().replace(/^trousseau:/, '') }, quandLiee: x => { if (x) lie++; } });
  const srv = http.createServer(async (q, r) => {
    const u = new URL(q.url, 'http://x');
    if (u.pathname.startsWith('/api/banque/')) { // comme le protocole app:// de l'application Mac
      let corps = ''; for await (const c of q) corps += c;
      const x = await B.appeler(u.pathname.slice(12), q.method, corps, u.search);
      r.writeHead(x.status, { 'content-type': 'application/json' }); return r.end(await x.text());
    }
    const f = path.join(ROOT, u.pathname.replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  await ctx.route(/gstatic\.com|googleapis\.com|firebase|corsproxy|allorigins|yahoo|binance|news\.google/, r => r.abort());
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.exposeFunction('__bq', async (a, v) => a === 'conf' ? B.etatConf() : a === 'demo' ? B.demo(v) : a === 'oublier' ? B.oublier() : B.enregistrerCle(v.nom, v.texte));
  await pg.addInitScript(() => {
    window.WebSocket = class { constructor() {} send() {} close() {} };
    localStorage.setItem('pat_data', JSON.stringify({ assets: [{ id: 'a3', cat: 'cash', name: 'Livret A', amount: 5000 }], set: { theme: 'light' } }));
    const r = v => () => Promise.resolve(v);
    window.__cle = null; window.__ouvert = [];
    window.open = u => { window.__ouvert.push(u); return null; };
    window.patrimoineMac = { ia: { etat: r({ installee: false }), installer: r({}), ecrire: r('') }, dictee: { etat: r({}), micro: r(false), installer: r({}), ecouter: r('') },
      maj: { etat: r({ etat: 'a-jour' }), verifier: r({}), installer: r(false), surChangement: () => {} },
      sauvegarder: r({ n: 1 }), etatSauvegardes: r({ n: 0 }), sauvegardes: r([]), lireSauvegarde: r('{}'), ouvrirSauvegardes: r(''), touchDispo: r(false), touchID: r(false),
      notifier: r(true), pdf: r({ ok: true }), barre: r(true), badge: r(0), demarrage: r(false), cleCoffre: r('x'.repeat(44)), ouvrirDocument: r({ ok: true }), connexionGoogle: r({}),
      surVerrou: () => {}, surCommande: cb => { window.__cmd = cb; },
      banque: { conf: () => window.__bq('conf'), demo: v => window.__bq('demo', v), oublier: () => window.__bq('oublier'),
        choisirCle: () => window.__cle ? window.__bq('cle', window.__cle) : Promise.resolve({ annule: true }) } };
  });
  await pg.goto(base); await pg.waitForTimeout(700);
  await pg.evaluate(() => go('bank')); await pg.waitForTimeout(600);
  const t0 = await pg.textContent('#v-bank');
  ok(/enablebanking\.com/.test(t0) && /Choisir le fichier \.pem/.test(t0) && /https:\/\/ikeupods-del\.github\.io\/patrimoineai\//.test(t0) && !/Netlify/i.test(t0), 'mise en route sur le Mac : étapes, adresse de retour, sans serveur ni Netlify');
  ok(!/Connectez-vous|Se connecter/.test(t0), 'aucune connexion Google demandée sur le Mac');

  // démonstration : liaison complète par le « navigateur » (retour sur 127.0.0.1, comme la vraie banque)
  await pg.click('[data-act="bqdemo"]'); await pg.waitForTimeout(500);
  ok(/Lier ma banque/.test(await pg.textContent('#v-bank')), 'démonstration : bouton « Lier ma banque »');
  await pg.click('[data-act="bqlier"]'); await pg.waitForTimeout(500);
  const url = await pg.evaluate(() => window.__ouvert[0]);
  ok(/^http:\/\/127\.0\.0\.1:\d+\/banque\?code=demo-[0-9a-f]+&state=mac\d+-[0-9a-f]{48}$/.test(url || ''), 'liaison : la banque renvoie vers l’application sur ce Mac (' + url + ')');
  const pb = await ctx.newPage(); await pb.goto(url);
  ok(/Banque liée/.test(await pb.textContent('h1')) && lie === 1, 'retour de la banque : page « Banque liée », application prévenue');
  await pb.close();
  await pg.evaluate(() => window.__cmd('bqlie')); await pg.waitForFunction(() => D.bank && D.bank.sync > 0, null, { timeout: 15000 });
  const r1 = await pg.evaluate(() => ({ comptes: D.bank.comptes.length, actifs: D.assets.filter(a => a.bq).map(a => a.amount), ops: D.ops.filter(o => /^eb:/.test(o.fid || '')).length, modal: $('modal').classList.contains('open') }));
  ok(r1.comptes === 2 && r1.actifs.includes(1834.27) && r1.actifs.includes(6200) && r1.ops > 10 && !r1.modal, 'banque liée : 2 comptes, soldes dans le patrimoine, opérations dans le budget (' + JSON.stringify(r1) + ')');
  ok(fs.readFileSync(path.join(dossier, 'banque-session.bin')).toString().startsWith('trousseau:{"v":1,"iv"'), 'session gardée sur le Mac, chiffrée puis confiée au trousseau');
  ok(/Mode démonstration/.test(await pg.textContent('#v-bank')), 'démonstration signalée sous la banque');
  // un second retour avec le même « state » est refusé (usage unique)
  const rejeu = await fetch(url.replace(/code=[^&]+/, 'code=demo-00')).catch(() => null);
  ok(!rejeu, 'retour rejoué : plus personne n’écoute après la liaison');

  // clé .pem de l'application : nom = identifiant, contenu vérifié, diagnostic
  await pg.evaluate(() => { window.__cle = { nom: 'pas-une-cle.pem', texte: 'bonjour' }; }); await pg.click('[data-act="bqcle"]'); await pg.waitForTimeout(300);
  ok(/ne contient pas de clé privée/.test(await pg.textContent('body')), 'fichier sans clé refusé avec un message clair');
  const pem = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' });
  await pg.evaluate(p => { window.__cle = { nom: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0.pem', texte: p }; }, pem); await pg.click('[data-act="bqcle"]'); await pg.waitForTimeout(1500);
  const conf = JSON.parse(fs.readFileSync(path.join(dossier, 'banque.json'), 'utf8'));
  ok(conf.appId === '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0' && /^dHJvdXNzZWF1Oi0t/.test(conf.cle) && !JSON.stringify(conf).includes('PRIVATE KEY'), 'clé enregistrée : identifiant tiré du nom, contenu confié au trousseau');
  const dg = await pg.textContent('#dgb');
  ok(/Clé de l’application/.test(dg) && /0f1e2d3c/.test(dg) && /Clé privée/.test(dg) && !/Netlify/.test(dg), 'diagnostic après la clé : lignes du Mac (' + dg.slice(0, 160) + ')');
  await pg.evaluate(() => closeM());

  // page en ligne : un retour destiné à l'application Mac est renvoyé vers 127.0.0.1
  const pw = await ctx.newPage(); let vers = '';
  await pw.route(/^http:\/\/127\.0\.0\.1:43210\//, r => { vers = r.request().url(); r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' }); });
  await pw.goto(base + '?code=abc&state=mac43210-' + 'ab'.repeat(24)); await pw.waitForURL(/43210/, { timeout: 8000 }).catch(() => {});
  ok(vers === 'http://127.0.0.1:43210/banque?code=abc&state=mac43210-' + 'ab'.repeat(24), 'page en ligne : retour de la banque renvoyé à l’application Mac');
  await pw.close();

  ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  console.log('banque (Mac) :', n, 'contrôles réussis'); B.arreter(); await b.close(); srv.close(); fs.rmSync(dossier, { recursive: true, force: true });
})().catch(e => { console.error('ÉCHEC :', e.message); process.exit(1); });
