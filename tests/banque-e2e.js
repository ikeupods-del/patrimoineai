// Scénario navigateur « Mes banques » et rappels de paiement, avec les vraies fonctions Netlify en mode démonstration
// (ENABLE_MOCK=1, sans Enable Banking) : liaison, retour de la banque, soldes dans le patrimoine, opérations classées,
// rappels Bricks / BienPrêter (Oui, Non, Montant différent, rapprochement bancaire, retard, notification), expiration,
// banque indisponible, déconnexion. Connexion Google imitée. node tests/banque-e2e.js [--photos dossier]
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), SHOTS = process.argv.includes('--photos') ? process.argv[process.argv.indexOf('--photos') + 1] : null;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const jour = k => { const d = new Date(); d.setDate(d.getDate() + k); return d.toLocaleDateString('sv-SE'); };
const moisDe = k => { const d = new Date(); d.setDate(15); d.setMonth(d.getMonth() + k); return d.toLocaleDateString('sv-SE').slice(0, 7); };

(async () => {
  /* fonctions Netlify : stockage en mémoire, clés « Google » de test */
  const { DEP } = await import(path.join(ROOT, 'netlify/banque/commun.mjs'));
  const H = {}; for (const f of ['etat', 'demarrer', 'retour', 'comptes', 'operations', 'deconnecter']) H[f] = (await import(path.join(ROOT, 'netlify/functions/banque-' + f + '.mjs'))).default;
  const g = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = Object.assign(g.publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256' });
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url'), s = Math.floor(Date.now() / 1000);
  const hb = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' }) + '.' + b64({ aud: 'quentools-adca1', iss: 'https://securetoken.google.com/quentools-adca1', sub: 'uid-1', email: 'moi@exemple.fr', email_verified: true, iat: s - 5, exp: s + 3600 });
  const TOKEN = hb + '.' + crypto.sign('RSA-SHA256', Buffer.from(hb), g.privateKey).toString('base64url');
  DEP.fetch = async url => { if (/googleapis\.com\/service_accounts/.test(url)) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } }); throw Error('réseau interdit : ' + url); };
  const MEM = new Map(); DEP.stockage = { lire: async u => MEM.has(u.uid) ? JSON.parse(MEM.get(u.uid)) : null, ecrire: async (u, c, o) => { MEM.set(u.uid, JSON.stringify(o)); }, effacer: async u => { MEM.delete(u.uid); } };
  process.env.ENABLE_MOCK = '1'; const APPELS = [];

  const srv = http.createServer(async (q, r) => {
    const p = q.url.split('?')[0];
    if (p.startsWith('/api/banque/')) {
      const nom = p.slice(12), h = H[nom]; APPELS.push(q.method + ' ' + nom); if (!h) { r.writeHead(404); return r.end(); }
      const corps = await new Promise(ok => { let b = ''; q.on('data', c => b += c); q.on('end', () => ok(b)); });
      const res = await h(new Request('http://' + q.headers.host + q.url, { method: q.method, headers: q.headers, body: q.method === 'GET' || q.method === 'OPTIONS' ? undefined : corps }), { ip: '81.2.3.4' });
      r.writeHead(res.status, Object.fromEntries(res.headers)); return r.end(await res.text());
    }
    let f = path.join(ROOT, p.replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  process.env.ENABLE_REDIRECT_URL = base;

  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await ctx.grantPermissions(['notifications'], { origin: base.slice(0, -1) });
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  /* SDK Firebase imité : compte Google connecté (uid-1) et Firestore vide */
  const FAKE = {
    'firebase-app.js': 'export const initializeApp=()=>({});',
    'firebase-auth.js': `const u={uid:'uid-1',email:'moi@exemple.fr',displayName:'Moi',photoURL:'',getIdToken:async()=>${JSON.stringify(TOKEN)}};const a={currentUser:u,authStateReady:async()=>{}};export const getAuth=()=>a;export class GoogleAuthProvider{static credential(){return{}}};export const signInWithPopup=async()=>({user:u});export const signInWithCredential=async()=>({user:u});export const signOut=async()=>{a.currentUser=null};`,
    'firebase-firestore.js': 'const v={exists:()=>false,data:()=>({})};export const getFirestore=()=>({});export const doc=(...p)=>p.slice(1).join("/");export const collection=(...p)=>p.slice(1).join("/");export const getDoc=async()=>v;export const getDocs=async()=>({docs:[]});export const deleteDoc=async()=>{};export const runTransaction=async(db,fn)=>fn({get:async()=>v,set(){}});'
  };
  await ctx.route(/gstatic\.com\/firebasejs\//, r => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: FAKE[r.request().url().split('/').pop()] || '' }));
  await ctx.route(/corsproxy\.io|allorigins\.win|googleapis\.com|news\.google/, r => r.abort());
  const plus3m = jour(-95);
  await ctx.addInitScript(([cree]) => {
    window.WebSocket = class { constructor() { setTimeout(() => this.onclose && this.onclose(), 10); } send() {} close() {} };
    window.__notifs = []; window.Notification = class { constructor(t, o) { window.__notifs.push(t); } static get permission() { return 'granted'; } static requestPermission() { return Promise.resolve('granted'); } };
    if (localStorage.getItem('pat_data')) return; /* seulement au premier chargement : le retour de la banque recharge la page */
    localStorage.setItem('pat_pass', 'phrase-secrete-test'); localStorage.setItem('pat_user', JSON.stringify({ email: 'moi@exemple.fr', user_metadata: { full_name: 'Moi' } }));
    localStorage.setItem('pat_data', JSON.stringify({ assets: [
      { id: 'bp1', cat: 'crowd', name: 'Prêt PME Lyon', plat: 'Bienprêter', amount: 1000, value: 1000, rate: 7, dur: 36, date: cree, status: 'cours' },
      { id: 'bk1', cat: 'immo', name: 'Appartement Bordeaux', plat: 'Bricks', amount: 500, value: 500, rate: 6, dur: 24, date: cree, status: 'cours' },
      { id: 'bk2', cat: 'immo', name: 'Maison Nantes', plat: 'Bricks', amount: 300, value: 300, rate: 6, dur: 24, date: cree, status: 'cours' }],
      rappels: [{ id: 'rbp', nom: 'BienPrêter', jour: 5, attendu: 42.5, motif: 'bienpreter|lemonway', dest: 'plateforme', cree, hist: {}, actif: true },
        { id: 'rbk', nom: 'Bricks', jour: 8, attendu: '', motif: 'bricks', dest: 'plateforme', cree, hist: {}, actif: true }],
      set: { theme: 'light' } }));
  }, [plus3m]);

  await pg.goto(base); await pg.waitForFunction(() => typeof ID !== 'undefined' && ID.user && ID.ready);
  ok(await pg.evaluate(() => D.rappels.length === 2 && rapDus().length >= 4), 'rappels du 5 et du 8 dus sur plusieurs mois');

  /* --- rappels sur l'accueil (banque pas encore liée) --- */
  const home = await pg.textContent('#v-home');
  ok(/Paiements à confirmer/.test(home) && /BienPrêter : paiement reçu \?/.test(home) && /Bricks : paiement reçu \?/.test(home), 'accueil : paiements à confirmer');
  ok(/En retard/.test(home) && /jours sans confirmation/.test(home), 'paiement non confirmé depuis plus de 3 jours : en retard');
  ok(!/Valider avec cette opération/.test(home), 'sans banque liée : pas de rapprochement proposé');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'rappels.png') });
  ok(await pg.evaluate(() => insights().some(i => /Paiement à confirmer : BienPrêter/.test(i.title))), 'point d’attention pour un paiement en retard');
  /* notification du navigateur, une fois par jour et par paiement */
  await pg.evaluate(() => { localStorage.removeItem('pat_rap_notif'); window.__notifs = []; rapNotifier(); });
  const nf1 = await pg.evaluate(() => window.__notifs.slice());
  ok(nf1.length === (await pg.evaluate(() => rapDus().length)) && nf1.some(t => /Paiement en retard : Bricks/.test(t)), 'notification du navigateur pour chaque paiement à confirmer (' + nf1.length + ')');
  await pg.evaluate(() => rapNotifier()); ok((await pg.evaluate(() => window.__notifs.length)) === nf1.length, 'pas de seconde notification le même jour');

  /* Oui avec montant habituel (un seul placement BienPrêter) : le mois le plus ancien */
  const vieux = moisDe(-2);
  await pg.click(`#rap-card [data-act=rapoui][data-id=rbp][data-m="${vieux}"]`); await pg.waitForTimeout(150);
  ok(await pg.evaluate(m => { const r = D.rappels.find(x => x.id === 'rbp'), a = D.assets.find(x => x.id === 'bp1'), w = D.assets.find(x => x.id === 'pf-bienpreter'); return r.hist[m].s === 'recu' && r.hist[m].m === 42.5 && a.paie.length === 1 && a.paie[0].m === 42.5 && a.mv.length === 2 && a.mv[1].m === -42.5 && w && w.amount === 42.5 && w.cat === 'cash'; }, vieux), '« Oui » : paiement inscrit dans l’historique du placement et ajouté au portefeuille BienPrêter');
  ok(/42,50\s€ de BienPrêter enregistrés/.test((await pg.textContent('#toast')).replace(/ | /g, ' ')), 'confirmation avec annulation possible');
  /* Non : pas encore reçu, puis pas de paiement ce mois-là */
  await pg.click(`#rap-card [data-act=rapnon][data-id=rbk][data-m="${vieux}"]`); await pg.click('[data-act=rapattente]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(m => !!D.rappels.find(x => x.id === 'rbk').non[m] && rapDus().some(x => x.r.id === 'rbk' && x.mois === m), vieux), '« Non, pas encore reçu » : le rappel reste affiché');
  ok(/Signalé non reçu/.test(await pg.textContent('#rap-card')), 'mention « signalé non reçu »');
  await pg.click(`#rap-card [data-act=rapnon][data-id=rbk][data-m="${vieux}"]`); await pg.click('[data-act=rapabsent]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(m => D.rappels.find(x => x.id === 'rbk').hist[m].s === 'absent' && !rapDus().some(x => x.r.id === 'rbk' && x.mois === m), vieux), '« Pas de paiement ce mois-ci » : rappel fermé sans rien enregistrer');
  /* Montant différent, avec part de capital et choix du placement (deux placements Bricks) */
  const mPrec = moisDe(-1);
  await pg.click(`#rap-card [data-act=rapautre][data-id=rbk][data-m="${mPrec}"]`);
  ok(await pg.locator('#rv-a option').count() === 3, 'deux placements Bricks : choix du placement concerné');
  await pg.fill('#rv-m', '21.4'); await pg.fill('#rv-c', '10'); await pg.selectOption('#rv-a', 'bk1'); await pg.click('[data-act=rapsave]'); await pg.waitForTimeout(150);
  ok(await pg.evaluate(m => { const a = D.assets.find(x => x.id === 'bk1'), w = D.assets.find(x => x.id === 'pf-bricks'), r = D.rappels.find(x => x.id === 'rbk'); return r.hist[m].m === 21.4 && r.hist[m].c === 10 && a.amount === 490 && a.value === 490 && a.paie[0].c === 10 && w.amount === 21.4; }, mPrec), '« Montant différent » : montant réel, capital déduit du placement, portefeuille Bricks crédité');
  await pg.click('#toast [data-act=toastact]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(m => !D.rappels.find(x => x.id === 'rbk').hist[m] && D.assets.find(x => x.id === 'bk1').amount === 500 && !D.assets.some(x => x.id === 'pf-bricks'), mPrec), 'annulation : tout revient comme avant');

  /* --- Mes banques : liaison (démonstration) --- */
  await pg.evaluate(() => go('bank')); await pg.waitForFunction(() => BQ.conf === true && !BQ.busy);
  let bank = await pg.textContent('#v-bank');
  ok(/Aucun compte lié/.test(bank) && /Lier ma banque/.test(bank) && /Jamais : vos identifiants/.test(bank), 'écran Mes banques : aucun compte lié');
  ok(/PEA et compte-titres/.test(bank) && /ne couvre que les comptes de paiement/.test(bank), 'PEA et compte-titres : limite de la DSP2 indiquée, rien d’inventé');
  ok(/Rappels de paiement/.test(bank) && /le 5 de chaque mois/.test(bank) && /le 8 de chaque mois/.test(bank), 'rappels listés');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'banque-vide.png'), fullPage: true });
  await Promise.all([pg.waitForEvent('load'), pg.click('[data-act=bqlier]')]);
  ok(APPELS.includes('POST demarrer'), 'liaison démarrée côté serveur');
  await pg.waitForFunction(() => typeof D !== 'undefined' && D.bank && D.bank.sync > 0 && !BQ.busy, null, { timeout: 15000 });
  ok(!/code=/.test(pg.url()) && /#bank$/.test(pg.url()), 'retour de la banque : adresse nettoyée, écran Mes banques');
  ok(APPELS.includes('POST retour') && APPELS.includes('GET comptes') && APPELS.filter(a => a === 'GET operations').length >= 1, 'session ouverte, soldes et opérations demandés');
  const T = await pg.evaluate(() => ({ b: D.bank, a: D.assets.filter(a => a.bq).map(a => [a.name, a.amount, a.cat]), net: totals().net, ops: D.ops.filter(o => /^eb:/.test(o.fid)) }));
  ok(T.b.banque === 'Boursorama' && T.b.statut === 'actif' && T.b.comptes.length === 2 && T.b.comptes.every(k => /^\d{4}$/.test(k.iban4) && !('iban' in k)), 'banque liée : deux comptes, IBAN jamais complet');
  ok(T.a.length === 2 && T.a.some(x => x[1] === 1834.27 && x[2] === 'cash' && /Boursorama · Compte courant/.test(x[0])) && T.a.some(x => x[1] === 6200), 'soldes ajoutés au patrimoine (liquidités)');
  ok(T.ops.length >= 10 && T.ops.every(o => o.cat) && T.ops.some(o => /NETFLIX/.test(o.lib) && o.cat === 'abonnement') && T.ops.some(o => /SALAIRE/.test(o.lib) && o.cat === 'revenu') && !T.ops.some(o => /EN ATTENTE/.test(o.lib)), 'opérations du compte courant classées (en attente écartées) : ' + T.ops.length);
  bank = await pg.textContent('#v-bank');
  ok(/Comptes liés/.test(bank) && /•••• 1234/.test(bank) && /Dernière synchronisation/.test(bank) && /Dernières opérations/.test(bank) && /Démonstration/.test(bank), 'comptes, date de synchronisation et opérations affichés');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'banque-liee.png'), fullPage: true });
  /* ne pas compter le livret */
  const net0 = T.net; await pg.click('#v-bank .sw[data-k^="bq:"] >> nth=1'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(n0 => D.assets.filter(a => a.bq).length === 1 && Math.abs(totals().net - (n0 - 6200)) < 0.01, net0), 'compte retiré du patrimoine à la demande');
  /* synchroniser de nouveau : rien en double */
  const nOps = T.ops.length; await pg.click('[data-act=bqsync]'); await pg.waitForFunction(() => !BQ.busy);
  ok(await pg.evaluate(n => D.ops.filter(o => /^eb:/.test(o.fid)).length === n && D.assets.filter(a => a.bq).length === 1, nOps), 'nouvelle synchronisation : aucune opération ni compte en double');

  /* --- rapprochement avec la banque --- */
  await pg.evaluate(() => go('home')); await pg.waitForTimeout(100);
  const cur = moisDe(0), hc = await pg.textContent('#rap-card');
  if (SHOTS) { await pg.evaluate(() => document.getElementById('rap-card').scrollIntoView()); await pg.screenshot({ path: path.join(SHOTS, 'rapprochement.png') }); }
  ok(/Valider avec cette opération/.test(hc) && /LEMONWAY BIENPRETER/.test(hc), 'virement BienPrêter trouvé sur le compte');
  await pg.click(`#rap-card [data-act=rapok][data-id=rbp][data-m="${cur}"]`); await pg.waitForTimeout(150);
  ok(await pg.evaluate(m => { const h = D.rappels.find(x => x.id === 'rbp').hist[m], o = D.ops.find(x => x.id === h.tx); return h.s === 'recu' && o && /BIENPRETER/.test(o.lib) && h.m === o.m && D.assets.find(x => x.id === 'pf-bienpreter').amount === 42.5; }, cur), 'validé avec l’opération : déjà dans le solde de la banque, portefeuille inchangé');
  ok(await pg.evaluate(m => { const u = rapUtilises(), x = rapDus().find(y => y.r.id === 'rbp'); return u.size === 1 && (!x || !rapMatch(x) || !u.has(rapMatch(x).id)); }, cur), 'une opération ne sert qu’une fois');
  await pg.evaluate(() => openDetail('bp1')); const det = await pg.textContent('#sheet');
  ok(/Paiements reçus \(2\)/.test(det) && /Rappel : le 5 de chaque mois/.test(det) && /Total reçu/.test(det), 'fiche du placement : historique des paiements');
  await pg.keyboard.press('Escape');

  /* --- nouveau rappel --- */
  await pg.evaluate(() => go('bank')); await pg.click('[data-act=rapnew]'); await pg.fill('#f-rnom', 'Homunity'); await pg.fill('#f-rjour', '31'); await pg.click('[data-act=seg][data-t=f-rdest][data-v=compte]');
  ok(!(await pg.locator('#r-cpt').isHidden()), 'choix du compte crédité');
  await pg.click('[data-act=rapenr]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => { const r = D.rappels.find(x => x.nom === 'Homunity'); return r && r.jour === 31 && r.dest === 'compte' && r.cpt && r.cree === today() && CL.prochaineEcheance(r, today()) > today(); }), 'rappel créé, compte crédité choisi, aucune demande avant sa date');

  /* --- accord bientôt expiré, puis expiré --- */
  await pg.evaluate(() => { D.bank.valid = new Date(Date.now() + 5.5 * 864e5).toISOString(); renderBank(); });
  ok(/À renouveler/.test(await pg.textContent('#v-bank')) && await pg.locator('#v-bank [data-act=bqlier]').count() === 1, 'accord bientôt expiré : « Renouveler »');
  ok(await pg.evaluate(() => insights().some(i => /plus que 5 jours/.test(i.title))), 'point d’attention : renouvellement dans 5 jours');
  await pg.evaluate(() => { D.bank.statut = 'expire'; renderBank(); });
  ok(await pg.locator('#v-bank [data-act=bqsync]').isDisabled() && /a expiré/.test(await pg.textContent('#v-bank')), 'accord expiré : synchronisation impossible, renouvellement proposé');
  await pg.evaluate(() => { D.bank.statut = 'actif'; D.bank.valid = new Date(Date.now() + 80 * 864e5).toISOString(); renderBank(); });

  /* --- banque indisponible --- */
  await pg.route('**/api/banque/comptes**', r => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ code: 'banque_indisponible', message: 'La banque ne répond pas pour le moment. Vos derniers soldes restent affichés ; réessayez plus tard.' }) }));
  await pg.click('[data-act=bqsync]'); await pg.waitForFunction(() => !BQ.busy);
  ok(/La banque ne répond pas/.test(await pg.textContent('#v-bank')) && /passager/.test(await pg.textContent('#v-bank')) && await pg.evaluate(() => D.assets.some(a => a.bq && a.amount === 1834.27)), 'banque indisponible : message clair, derniers soldes gardés');
  await pg.unroute('**/api/banque/comptes**');

  /* --- déconnexion --- */
  await pg.click('[data-act=bqdeco]'); await pg.click('[data-act=askok]'); await pg.waitForFunction(() => !BQ.busy && !D.bank);
  ok(APPELS.includes('POST deconnecter') && await pg.evaluate(() => D.assets.some(a => a.id.startsWith('bq-') && !a.bq) && /Aucun compte lié/.test(document.getElementById('v-bank').textContent)), 'déconnexion : session révoquée, soldes gardés comme comptes saisis');
  ok(await pg.evaluate(() => { const P = payload(); return Array.isArray(P.rappels) && P.rappels.length === 3 && P.bank === null && SF.includes('rappels') && SF.includes('bank'); }), 'rappels et banque synchronisés entre appareils');

  /* --- serveur non configuré --- */
  delete process.env.ENABLE_MOCK; await pg.evaluate(() => { BQ.vu = 0; return bqEtat(); });
  ok(/configuration est incomplète/.test(await pg.textContent('#v-bank')) && /ENABLE_APP_ID/.test(await pg.textContent('#v-bank')), 'serveur sans clés : configuration manquante indiquée');

  ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  await b.close(); srv.close();
  console.log('banque (navigateur) :', n, 'contrôles réussis');
})().catch(e => { console.error(e); process.exit(1); });
