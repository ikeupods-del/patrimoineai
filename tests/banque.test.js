// Fonctions bancaires (Netlify) : compte Google vérifié, jeton Enable Banking signé, « state », session chiffrée dans Firestore,
// soldes en cache, opérations paginées, accord expiré, banque indisponible, déconnexion, mode démonstration.
// Aucun réseau : Google, Enable Banking et Firestore sont imités. node tests/banque.test.js
const assert = require('assert'), crypto = require('crypto'), path = require('path');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const F = f => import(path.join(__dirname, '..', 'banque', f));

(async () => {
  const { DEP } = await F('commun.mjs');
  const H = {}; for (const f of ['etat', 'demarrer', 'retour', 'comptes', 'operations', 'deconnecter', 'diagnostic']) H[f] = (await F('routes/' + f + '.mjs')).default;

  /* horloge maîtrisée */
  let T = Date.parse('2026-10-16T10:00:00Z'); DEP.maintenant = () => T;
  /* « Google » : clé de signature des jetons d'identité ; « Enable Banking » : clé de l'application */
  const g = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), app = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = Object.assign(g.publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const idToken = (p, cle = g.privateKey) => { const s = Math.floor(T / 1000), h = b64({ alg: 'RS256', kid: 'k1', typ: 'JWT' }), b = b64(Object.assign({ aud: 'quentools-adca1', iss: 'https://securetoken.google.com/quentools-adca1', sub: 'uid-1', email: 'moi@exemple.fr', email_verified: true, iat: s - 10, exp: s + 3600 }, p)); return h + '.' + b + '.' + crypto.sign('RSA-SHA256', Buffer.from(h + '.' + b), cle).toString('base64url'); };
  let TOK = idToken({});

  /* réseau imité */
  const EB = [], FS = new Map(); let ebRoute = null, jwksN = 0;
  DEP.fetch = async (url, opt = {}) => {
    const u = new URL(url), h = opt.headers || {}, rep = (o, st = 200, hd = {}) => new Response(typeof o === 'string' ? o : JSON.stringify(o), { status: st, headers: Object.assign({ 'content-type': 'application/json' }, hd) });
    if (u.hostname === 'www.googleapis.com') { jwksN++; return rep({ keys: [jwk] }, 200, { 'cache-control': 'public, max-age=3600' }); }
    if (u.hostname === 'firestore.googleapis.com') {
      ok(h.authorization === 'Bearer ' + TOK && /\/users\/uid-1\/apps\/patrimoine\/banque\/etat$/.test(u.pathname), 'Firestore : document de l’utilisateur, avec son propre jeton');
      if (opt.method === 'PATCH') { FS.set(u.pathname, JSON.parse(opt.body)); return rep({}); }
      if (opt.method === 'DELETE') { FS.delete(u.pathname); return rep({}); }
      return FS.has(u.pathname) ? rep(FS.get(u.pathname)) : rep({ error: { code: 404 } }, 404);
    }
    if (u.hostname === 'api.enablebanking.com') {
      const corps = opt.body ? JSON.parse(opt.body) : null; EB.push({ m: opt.method || 'GET', p: u.pathname + u.search, h, corps });
      const r = ebRoute && ebRoute(opt.method || 'GET', u, corps);
      if (r && typeof r.then === 'function') return r;
      if (r) return r.status ? rep(r.body, r.status) : rep(r);
      throw Error('appel imprévu ' + url);
    }
    throw Error('hôte inattendu ' + url);
  };
  const appel = async (f, { methode = 'GET', q = '', corps, jeton = (TOK = idToken({})), origine = 'https://ikeupods-del.github.io', ip = '81.2.3.4' } = {}) => {
    const hd = { 'user-agent': 'Navigateur de test' }; if (jeton) hd.authorization = 'Bearer ' + jeton; if (origine) hd.origin = origine;
    const r = await H[f](new Request('https://patrimoine.netlify.app/api/banque/' + f + q, { method: methode, headers: hd, body: corps ? JSON.stringify(corps) : undefined }), { ip });
    return { st: r.status, h: r.headers, d: methode === 'OPTIONS' ? null : await r.json() };
  };

  /* --- accès --- */
  ['ENABLE_APP_ID', 'ENABLE_PRIVATE_KEY', 'ENABLE_REDIRECT_URL', 'ENABLE_MOCK', 'ENABLE_ALLOWED_EMAILS', 'ENABLE_ASPSP_NAME'].forEach(k => delete process.env[k]);
  let r = await appel('etat', { jeton: null }); ok(r.st === 401 && r.d.code === 'connexion_requise', 'sans connexion Google : refusé');
  r = await appel('etat', { jeton: idToken({}, app.privateKey) }); ok(r.st === 401, 'jeton mal signé : refusé');
  r = await appel('etat', { jeton: idToken({ aud: 'autre-projet' }) }); ok(r.st === 401, 'jeton d’un autre projet Firebase : refusé');
  r = await appel('etat', { jeton: idToken({ exp: Math.floor(T / 1000) - 5 }) }); ok(r.st === 401, 'jeton expiré : refusé');
  r = await appel('etat', { origine: 'https://pirate.example' }); ok(r.st === 403 && r.d.code === 'origine', 'origine inconnue : refusée');
  r = await appel('etat', { methode: 'OPTIONS' }); ok(r.st === 204 && r.h.get('access-control-allow-origin') === 'https://ikeupods-del.github.io' && /authorization/.test(r.h.get('access-control-allow-headers')), 'pré-vérification CORS pour l’application en ligne');
  r = await appel('etat', { origine: 'app://patrimoine' }); ok(r.st === 200 && r.h.get('access-control-allow-origin') === 'app://patrimoine', 'application Mac autorisée');
  ok(r.d.configure === false && r.d.manque.join() === 'ENABLE_APP_ID,ENABLE_PRIVATE_KEY,ENABLE_REDIRECT_URL', 'non configuré : variables manquantes listées');
  ok(jwksN === 1, 'clés publiques de Google gardées en cache');
  r = await appel('demarrer', { methode: 'POST' }); ok(r.st === 503 && r.d.code === 'non_configure', 'liaison impossible sans configuration');

  /* --- configuration réelle (imitée) --- */
  Object.assign(process.env, { ENABLE_APP_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', ENABLE_PRIVATE_KEY: app.privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n'), ENABLE_REDIRECT_URL: 'https://ikeupods-del.github.io/patrimoineai/' });
  let sessions = 0, solde = 1234.56, pages = { 'p-2': { transactions: [{ entry_reference: 'E3', booking_date: '2026-10-08', transaction_amount: { amount: '18.30', currency: 'EUR' }, credit_debit_indicator: 'CRDT', debtor: { name: 'BRICKS' }, remittance_information: ['LOYERS OCTOBRE'], status: 'BOOK' }] } };
  ebRoute = (m, u, corps) => {
    const p = u.pathname;
    if (p === '/aspsps') return { aspsps: [{ name: 'BNP Paribas', country: 'FR' }, { name: 'BoursoBank', country: 'FR', maximum_consent_validity: 15552000 }] };
    if (p === '/auth') return { url: 'https://tilisy.enablebanking.com/welcome?sessionid=xyz', authorization_id: 'auth-1' };
    if (p === '/sessions' && m === 'POST') { sessions++; return { session_id: 'sess-' + sessions, aspsp: { name: 'BoursoBank', country: 'FR' }, access: { valid_until: '2027-01-14T10:00:00+00:00' }, accounts: [{ uid: 'acc-' + sessions, account_id: { iban: 'FR76 3000 1234 5678 9012 3456 789' }, name: 'Compte bancaire', currency: 'EUR', cash_account_type: 'CACC' }] }; }
    if (/^\/sessions\//.test(p) && m === 'DELETE') return {};
    if (/^\/sessions\//.test(p)) return { status: 'AUTHORIZED', access: { valid_until: '2027-01-14T10:00:00+00:00' } };
    if (/\/balances$/.test(p)) return { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '999.00', currency: 'EUR' } }, { balance_type: 'CLBD', reference_date: '2026-10-15', balance_amount: { amount: String(solde), currency: 'EUR' } }] };
    if (/\/transactions$/.test(p)) { T += 5000; const k = u.searchParams.get('continuation_key'); if (k) return pages[k]; return { continuation_key: 'p-2', transactions: [{ entry_reference: 'E1', booking_date: '2026-10-03', transaction_amount: { amount: '54.20', currency: 'EUR' }, credit_debit_indicator: 'DBIT', remittance_information: ['EREF+123', 'CB CARREFOUR MARKET'], status: 'BOOK' }, { transaction_id: 'E2', transaction_date: '2026-10-16', transaction_amount: { amount: '5.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', remittance_information: ['CB EN ATTENTE'], status: 'PDNG' }] }; }
  };
  r = await appel('etat'); ok(r.st === 200 && r.d.configure && !r.d.lie, 'configuré, aucune banque liée');

  r = await appel('demarrer', { methode: 'POST' });
  ok(r.st === 200 && r.d.url === 'https://tilisy.enablebanking.com/welcome?sessionid=xyz' && r.d.banque === 'BoursoBank', 'liaison démarrée : adresse de connexion bancaire renvoyée');
  const auth = EB.find(x => x.p === '/auth'), aspsps = EB.find(x => /^\/aspsps/.test(x.p));
  ok(aspsps.p === '/aspsps?country=FR', 'liste des banques françaises lue');
  ok(auth.m === 'POST' && auth.corps.aspsp.name === 'BoursoBank' && auth.corps.aspsp.country === 'FR' && auth.corps.redirect_url === 'https://ikeupods-del.github.io/patrimoineai/' && auth.corps.psu_type === 'personal' && /^[0-9a-f]{48}$/.test(auth.corps.state), 'POST /auth : banque, adresse de retour, state aléatoire');
  ok(Math.round((Date.parse(auth.corps.access.valid_until) - T) / 864e5) === 90, 'accord demandé pour 90 jours (la banque en accepte 180)');
  ok(auth.h['Psu-Ip-Address'] === '81.2.3.4' && auth.h['Psu-User-Agent'] === 'Navigateur de test', 'présence de l’utilisateur transmise (IP, navigateur)');
  { const [h, p, s] = auth.h.authorization.replace('Bearer ', '').split('.'), hd = JSON.parse(Buffer.from(h, 'base64url')), pl = JSON.parse(Buffer.from(p, 'base64url'));
    ok(hd.typ === 'JWT' && hd.alg === 'RS256' && hd.kid === 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'JWT : en-tête typ, alg RS256, kid = identifiant de l’application');
    ok(pl.iss === 'enablebanking.com' && pl.aud === 'api.enablebanking.com' && pl.iat === Math.floor(T / 1000) && pl.exp - pl.iat === 3600, 'JWT : émetteur, audience, une heure au plus');
    ok(crypto.verify('RSA-SHA256', Buffer.from(h + '.' + p), app.publicKey, Buffer.from(s, 'base64url')), 'JWT : signature vérifiable avec la clé publique de l’application'); }
  const state = auth.corps.state, doc = () => JSON.stringify([...FS.values()]);
  ok(FS.size === 1 && !doc().includes(state), 'state gardé chiffré dans le compte');

  r = await appel('retour', { methode: 'POST', corps: { code: 'c1', state: 'faux' } }); ok(r.st === 400 && r.d.code === 'etat_invalide', 'retour avec un autre state : refusé');
  r = await appel('retour', { methode: 'POST', corps: { code: 'c1', state } });
  ok(r.st === 200 && r.d.lie && r.d.statut === 'actif' && r.d.banque === 'BoursoBank' && r.d.valid === '2027-01-14T10:00:00+00:00', 'session ouverte au retour de la banque');
  ok(EB.find(x => x.p === '/sessions' && x.m === 'POST').corps.code === 'c1', 'POST /sessions avec le code reçu');
  const k1 = r.d.comptes[0]; ok(k1.uid === 'acc-1' && k1.iban4 === '6789' && k1.type === 'CACC' && /^[0-9a-f]{16}$/.test(k1.ref) && !JSON.stringify(r.d).includes('FR76'), 'compte : 4 derniers chiffres seulement, empreinte stable');
  ok(!doc().includes('sess-1') && !doc().includes('acc-1') && !doc().includes('FR76'), 'session et comptes chiffrés dans Firestore (illisibles sans la clé du serveur)');
  r = await appel('retour', { methode: 'POST', corps: { code: 'c1', state } }); ok(r.st === 400, 'le même retour ne peut pas servir deux fois');

  /* --- soldes --- */
  const nEB = () => EB.length;
  r = await appel('comptes'); ok(r.st === 200 && r.d.soldes['acc-1'].montant === 1234.56 && r.d.soldes['acc-1'].type === 'CLBD', 'solde : comptable de clôture retenu');
  ok(EB[EB.length - 1].p === '/accounts/acc-1/balances' && EB[EB.length - 1].h['Psu-Ip-Address'] === '81.2.3.4', 'GET /accounts/{uid}/balances en présence de l’utilisateur');
  let avant = nEB(); solde = 2000;
  r = await appel('comptes'); ok(r.d.cache && r.d.soldes['acc-1'].montant === 1234.56 && nEB() === avant, 'soldes gardés 10 minutes');
  r = await appel('comptes', { q: '?force=1' }); ok(r.d.cache && nEB() === avant, 'même forcé : pas plus d’une consultation par minute');
  T += 2 * 60e3; r = await appel('comptes', { q: '?force=1' }); ok(!r.d.cache && r.d.soldes['acc-1'].montant === 2000, 'actualisation forcée après une minute');

  /* --- opérations paginées --- */
  r = await appel('operations', { q: '?compte=acc-1&depuis=2026-09-01' });
  ok(r.st === 200 && r.d.operations.length === 2 && r.d.suite === 'p-2', 'durée limitée : première page et clé de suite');
  const [o1, o2] = r.d.operations;
  ok(o1.m === -54.2 && o1.d === '2026-10-03' && o1.lib === 'CB CARREFOUR MARKET' && o1.id === 'E1' && o2.etat === 'PDNG' && o2.d === '2026-10-16', 'opérations : débit négatif, préfixe SEPA retiré, en attente signalée');
  ok(EB.filter(x => /transactions/.test(x.p)).pop().p === '/accounts/acc-1/transactions?date_from=2026-09-01', 'GET transactions avec date_from');
  r = await appel('operations', { q: '?compte=acc-1&depuis=2026-09-01&suite=p-2' });
  ok(r.d.operations.length === 1 && r.d.operations[0].m === 18.3 && r.d.operations[0].lib === 'BRICKS LOYERS OCTOBRE' && r.d.suite === null, 'page suivante (continuation_key) puis fin');
  ok(EB.filter(x => /transactions/.test(x.p)).pop().p === '/accounts/acc-1/transactions?date_from=2026-09-01&continuation_key=p-2', 'continuation_key transmise');
  r = await appel('operations', { q: '?compte=inconnu' }); ok(r.st === 400, 'compte d’une autre personne : refusé');

  /* --- erreurs de la banque --- */
  const route0 = ebRoute;
  ebRoute = (m, u, c) => /balances/.test(u.pathname) ? { status: 503, body: { code: 503, message: 'ASPSP service unavailable', error: 'ASPSP_ERROR' } } : route0(m, u, c);
  T += 11 * 60e3; r = await appel('comptes'); ok(r.st === 502 && r.d.code === 'banque_indisponible', 'banque indisponible : message clair');
  ebRoute = (m, u, c) => /balances/.test(u.pathname) ? Promise.reject(Object.assign(Error('stop'), { name: 'AbortError' })) : route0(m, u, c);
  r = await appel('comptes'); ok(r.st === 504 && r.d.code === 'delai', 'banque trop lente : délai dépassé');
  ebRoute = (m, u, c) => /balances|sessions\/sess/.test(u.pathname) && m === 'GET' ? { status: 401, body: { code: 401, message: 'Session expired', error: 'EXPIRED_SESSION' } } : route0(m, u, c);
  r = await appel('comptes'); ok(r.st === 401 && r.d.code === 'consentement_expire', 'accord expiré : « Renouveler »');
  T += 2 * 36e5; r = await appel('etat'); ok(r.st === 200 && r.d.lie && r.d.statut === 'expire', 'état : accord expiré affiché ' + JSON.stringify(r.d));
  r = await appel('comptes'); ok(r.st === 401 && r.d.code === 'consentement_expire', 'plus aucune consultation avec un accord expiré');
  ebRoute = route0;

  /* --- renouvellement : nouvelle session, l'ancienne est révoquée --- */
  r = await appel('demarrer', { methode: 'POST' }); const st2 = EB.filter(x => x.p === '/auth').pop().corps.state;
  r = await appel('retour', { methode: 'POST', corps: { code: 'c2', state: st2 } });
  ok(r.d.statut === 'actif' && r.d.comptes[0].uid === 'acc-2' && r.d.comptes[0].ref === k1.ref, 'renouvelé : même empreinte de compte malgré un nouvel identifiant');
  ok(EB.some(x => x.m === 'DELETE' && x.p === '/sessions/sess-1'), 'ancienne session révoquée');

  /* --- déconnexion --- */
  r = await appel('deconnecter', { methode: 'POST' }); ok(r.st === 200 && !r.d.lie && r.d.revoquee && EB.some(x => x.m === 'DELETE' && x.p === '/sessions/sess-2') && FS.size === 0, 'déconnexion : session révoquée et effacée');
  r = await appel('etat'); ok(!r.d.lie, 'plus aucune banque liée');

  /* --- un seul compte Google autorisé --- */
  process.env.ENABLE_ALLOWED_EMAILS = 'proprietaire@exemple.fr';
  r = await appel('etat'); ok(r.st === 403 && r.d.code === 'acces_refuse', 'compte Google non autorisé : refusé');
  process.env.ENABLE_ALLOWED_EMAILS = 'Moi@Exemple.fr'; r = await appel('etat'); ok(r.st === 200, 'compte autorisé');
  delete process.env.ENABLE_ALLOWED_EMAILS;

  /* --- diagnostic de configuration --- */
  const route1 = ebRoute;
  ebRoute = (m, u, c) => u.pathname === '/application' ? { name: 'Patrimoine AI', environment: 'SANDBOX', redirect_urls: ['https://autre.example/'] } : route1(m, u, c);
  r = await appel('diagnostic'); const ln = t => r.d.lignes.find(x => x.titre === t);
  ok(r.st === 200 && r.d.ok === false && ln('Clé privée').ok && ln('Application Enable Banking').ok && ln('Adresse de retour').ok === false && /telle quelle/.test(ln('Adresse de retour').detail), 'diagnostic : adresse de retour différente de celle déclarée');
  ok(ln('Banque').ok && /BoursoBank/.test(ln('Banque').detail) && ln('Accès réservé').ok === null && ln('Stockage Firestore').ok, 'diagnostic : banque trouvée, accès non réservé signalé, stockage lisible');
  ebRoute = (m, u, c) => u.pathname === '/application' ? { name: 'Patrimoine AI', redirect_urls: ['https://ikeupods-del.github.io/patrimoineai'] } : route1(m, u, c);
  r = await appel('diagnostic'); ok(r.d.ok === true && ln('Adresse de retour').ok, 'diagnostic : tout est bon (barre finale ignorée)');
  ebRoute = (m, u, c) => u.pathname === '/application' ? { status: 401, body: { code: 401, message: 'Invalid signature' } } : route1(m, u, c);
  r = await appel('diagnostic'); ok(r.d.ok === false && /ne correspondent pas/.test(ln('Application Enable Banking').detail), 'diagnostic : clé refusée par Enable Banking');
  T += 2 * 864e5; /* la liste des banques est gardée 24 h */
  ebRoute = (m, u, c) => u.pathname === '/aspsps' ? { aspsps: [{ name: 'BNP Paribas', country: 'FR' }] } : u.pathname === '/application' ? {} : route1(m, u, c);
  r = await appel('diagnostic'); ok(ln('Banque').ok === false && /ENABLE_ASPSP_NAME/.test(ln('Banque').detail) && /Banques proposées : BNP Paribas\./.test(ln('Banque').detail), 'diagnostic : banque introuvable, banques proposées listées, nom à préciser');
  ebRoute = route1;
  /* plusieurs adresses de retour possibles : celle déclarée chez Enable Banking est utilisée */
  T += 2 * 864e5; process.env.ENABLE_REDIRECT_URL = 'https://ikeupods-del.github.io/patrimoineai/,https://quentools.fr/';
  ebRoute = (m, u, c) => u.pathname === '/application' ? { name: 'Patrimoine AI', redirect_urls: ['https://quentools.fr/'] } : route1(m, u, c);
  r = await appel('diagnostic'); ok(r.d.ok === true && ln('Adresse de retour').ok && /quentools\.fr/.test(ln('Adresse de retour').detail), 'diagnostic : adresse de retour déclarée trouvée parmi les possibles');
  await appel('demarrer', { methode: 'POST' }); ok(EB.filter(x => x.p === '/auth').pop().corps.redirect_url === 'https://quentools.fr/', 'liaison : adresse de retour déclarée chez Enable Banking utilisée');
  ebRoute = (m, u, c) => u.pathname === '/application' ? { name: 'Patrimoine AI', redirect_urls: ['https://autre.example/'] } : route1(m, u, c);
  r = await appel('diagnostic'); ok(ln('Adresse de retour').ok === false && /ikeupods-del\.github\.io\/patrimoineai ou https:\/\/quentools\.fr/.test(ln('Adresse de retour').detail), 'diagnostic : aucune adresse utilisable, les deux possibles proposées');
  process.env.ENABLE_REDIRECT_URL = 'https://ikeupods-del.github.io/patrimoineai/'; ebRoute = route1;
  process.env.ENABLE_MOCK = '1'; r = await appel('etat'); ok(r.st === 200 && r.d.mockIgnore === true && r.d.simulation === false, 'ENABLE_MOCK oublié avec de vraies clés : ignoré, la vraie banque reste utilisée');
  r = await appel('diagnostic'); ok(!ln('Démonstration ignorée').ok, 'diagnostic : demande de retirer ENABLE_MOCK'); delete process.env.ENABLE_MOCK;
  /* comptes sans détails : nom et IBAN demandés à la banque */
  ebRoute = (m, u, c) => u.pathname === '/sessions' && m === 'POST' ? { session_id: 'sess-9', aspsp: { name: 'BoursoBank' }, access: { valid_until: '2027-01-14T10:00:00+00:00' }, accounts: ['acc-9'] } : /\/accounts\/acc-9\/details$/.test(u.pathname) ? { name: 'Compte chèques', account_id: { iban: 'FR7612345678901234567890123' }, cash_account_type: 'CACC' } : route1(m, u, c);
  T += 2 * 864e5; await appel('demarrer', { methode: 'POST' }); const st9 = EB.filter(x => x.p === '/auth').pop().corps.state;
  r = await appel('retour', { methode: 'POST', corps: { code: 'c9', state: st9 } });
  ok(r.d.comptes[0].uid === 'acc-9' && r.d.comptes[0].nom === 'Compte chèques' && r.d.comptes[0].iban4 === '0123' && EB.some(x => x.p === '/accounts/acc-9/details'), 'comptes donnés par leur seul identifiant : détails demandés');
  await appel('deconnecter', { methode: 'POST' }); ebRoute = route1;

  /* --- mode démonstration : tout le parcours sans Enable Banking --- */
  ['ENABLE_APP_ID', 'ENABLE_PRIVATE_KEY'].forEach(k => delete process.env[k]); process.env.ENABLE_MOCK = '1';
  const n0 = EB.length;
  r = await appel('demarrer', { methode: 'POST' }); const du = new URL(r.d.url);
  ok(r.st === 200 && du.origin + du.pathname === 'https://ikeupods-del.github.io/patrimoineai/' && /^demo-/.test(du.searchParams.get('code')), 'démonstration : retour direct vers l’application');
  r = await appel('retour', { methode: 'POST', corps: { code: du.searchParams.get('code'), state: du.searchParams.get('state') } });
  ok(r.d.lie && r.d.simulation && r.d.comptes.length === 2, 'démonstration : deux comptes');
  r = await appel('comptes'); ok(r.d.soldes['demo-courant'].montant === 1834.27, 'démonstration : soldes');
  let all = [], s = '', i = 0; do { r = await appel('operations', { q: '?compte=demo-courant&depuis=2026-08-01' + (s ? '&suite=' + s : '') }); all = all.concat(r.d.operations); s = r.d.suite; } while (s && ++i < 5);
  ok(all.some(o => /BRICKS/.test(o.lib) && o.m > 0) && all.some(o => /BIENPRETER/.test(o.lib)) && all.some(o => o.etat === 'PDNG') && i === 0 && all.length >= 12, 'démonstration : les deux pages lues en un seul appel (' + all.length + ' opérations)');
  r = await appel('deconnecter', { methode: 'DELETE' }); ok(!r.d.lie && EB.length === n0, 'démonstration : aucun appel à Enable Banking');

  /* hébergement Netlify : noms de variables ENABLE_BANKING_*, sessions dans Netlify Blobs (une par compte, chiffrée), fonctions */
  {
    const { conf } = await F('commun.mjs'), avant = Object.assign({}, process.env);
    ['ENABLE_APP_ID', 'ENABLE_PRIVATE_KEY', 'ENABLE_MOCK'].forEach(k => delete process.env[k]);
    Object.assign(process.env, { ENABLE_BANKING_APP_ID: 'aaaaaaaa-1111-2222-3333-444444444444', ENABLE_BANKING_PRIVATE_KEY: Buffer.from(app.privateKey.export({ type: 'pkcs8', format: 'pem' })).toString('base64') });
    const c = conf(); ok(c.appId === 'aaaaaaaa-1111-2222-3333-444444444444' && /BEGIN PRIVATE KEY/.test(c.cle), 'variables ENABLE_BANKING_APP_ID et ENABLE_BANKING_PRIVATE_KEY (clé en base64) acceptées');
    const { stockageBlobs } = await F('stockage-blobs.mjs'), M = new Map(); let nomStore = '';
    const S = stockageBlobs(async () => o => { nomStore = o.name + ':' + o.consistency; return { get: async k => M.get(k) ?? null, set: async (k, v) => { M.set(k, v); }, delete: async k => { M.delete(k); } }; });
    const u1 = { uid: 'uid-1' }, u2 = { uid: 'uid/2' };
    await S.ecrire(u1, c, { sid: 'session-secrete', valid: '2027-01-01' }); await S.ecrire(u2, c, { sid: 'autre' });
    const brut = M.get('session/uid-1');
    ok(nomStore === 'patrimoine-banque:strong' && M.has('session/uid_2') && !/session-secrete/.test(brut) && (await S.lire(u1, c)).sid === 'session-secrete' && (await S.lire(u2, c)).sid === 'autre', 'Netlify Blobs : une session par compte Google, chiffrée');
    await S.effacer(u1, c); ok((await S.lire(u1, c)) === null && (await S.lire({ uid: 'inconnu' }, c)) === null, 'Netlify Blobs : déconnexion, compte sans session');
    for (const f of ['etat', 'demarrer', 'retour', 'comptes', 'operations', 'deconnecter', 'diagnostic']) {
      const src = require('fs').readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'banque-' + f + '.mjs'), 'utf8'), m = await import(path.join(__dirname, '..', 'netlify', 'functions', 'banque-' + f + '.mjs'));
      ok(typeof m.default === 'function' && m.config.path === '/api/banque/' + f && new RegExp("export const config = \\{ path: '/api/banque/" + f + "' \\}").test(src), 'fonction Netlify ' + f + ' : point d’entrée et chemin déclarés dans le fichier');
    }
    for (const k of Object.keys(process.env)) if (!(k in avant)) delete process.env[k];
    Object.assign(process.env, avant);
  }
  console.log('banque :', n, 'contrôles réussis');
})().catch(e => { console.error(e); process.exit(1); });
