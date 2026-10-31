// Notifications push des rappels (hébergement Netlify facultatif) : jeton VAPID signé, jours à prévenir, abonnement par compte
// Google, tournée quotidienne (envoi sans contenu, abonnement expiré effacé). Aucun réseau. node tests/push.test.js
const assert = require('assert'), crypto = require('crypto'), path = require('path');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const F = f => import(path.join(__dirname, '..', f));

(async () => {
  const { DEP } = await F('banque/commun.mjs'), P = await F('push/push.mjs');
  const k = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), jwk = k.privateKey.export({ format: 'jwk' });
  const pub = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  ok(!P.confPush().configure, 'sans clés VAPID : non configuré');
  Object.assign(process.env, { VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: jwk.d, VAPID_SUBJECT: 'mailto:test@example.fr' });
  const c = P.confPush(); ok(c.configure, 'clés VAPID lues dans les variables d’environnement');
  const T = Date.parse('2026-11-05T07:00:00Z'), t = P.jetonVapid('https://fcm.googleapis.com/fcm/send/abc', c, T), [h, p, s] = t.split('.');
  const cl = JSON.parse(Buffer.from(p, 'base64url'));
  ok(crypto.verify('sha256', Buffer.from(h + '.' + p), { key: k.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')) && cl.aud === 'https://fcm.googleapis.com' && cl.sub === 'mailto:test@example.fr' && cl.exp === T / 1000 + 43200, 'jeton VAPID ES256 signé, destiné au service push');
  const A = { jours: [{ j: 5, ouvre: true }, { j: 8, ouvre: true }], attente: ['2026-10-05'] };
  ok(P.aPrevenir(A, '2026-11-05') && P.aPrevenir(A, '2026-10-08') && P.aPrevenir(A, '2026-10-15') && !P.aPrevenir(A, '2026-10-09') && !P.aPrevenir(A, '2026-11-06'), 'jours à prévenir : échéances, puis 3 et 10 jours après une date à confirmer');
  ok(P.aPrevenir({ jours: [{ j: 8 }] }, '2026-11-09') && !P.aPrevenir({ jours: [{ j: 8 }] }, '2026-11-08'), 'échéance un dimanche : prévenu le jour ouvré suivant');
  /* abonnement : compte Google vérifié, données réduites au strict nécessaire, chiffrées */
  const M = new Map(), fake = async () => o => ({ get: async x => M.get(x) ?? null, set: async (x, v) => { M.set(x, v); }, delete: async x => { M.delete(x); }, list: async () => ({ blobs: [...M.keys()].filter(x => x.startsWith(o.name === 'patrimoine-push' ? 'abonnement/' : '')).map(key => ({ key })) }) });
  P.DEP_PUSH.stockage = P.stockagePush(fake); DEP.utilisateur = async () => ({ uid: 'uid-1', email: 'moi@exemple.fr' });
  const route = (await F('push/routes/abonnement.mjs')).default, cle = (await F('push/routes/cle.mjs')).default;
  const rq = (m, b) => new Request('https://site.netlify.app/api/push/abonnement', { method: m, headers: { 'content-type': 'application/json' }, body: b ? JSON.stringify(b) : undefined });
  const rc = await (await cle(new Request('https://site.netlify.app/api/push/cle'))).json(); ok(rc.configure && rc.cle === pub, 'clé publique transmise à la page');
  let r = await route(rq('POST', { abonnement: { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'x', auth: 'y' } }, jours: [{ j: 5 }, { j: 8, ouvre: false }], attente: ['2026-10-05', 'pas une date'], montant: 42, nom: 'BienPrêter' }));
  const brut = M.get('abonnement/uid-1'), lu = await P.stock().lire('uid-1', c);
  ok(r.status === 200 && !/fcm|BienPr|42/.test(brut) && lu.abonnement.endpoint === 'https://fcm.googleapis.com/fcm/send/abc' && !lu.abonnement.keys && lu.jours.length === 2 && lu.jours[1].ouvre === false && lu.attente.join() === '2026-10-05' && !('nom' in lu) && !('montant' in lu), 'abonnement : adresse, jours et dates seulement, chiffrés sous le compte Google');
  r = await route(rq('POST', { abonnement: { endpoint: 'http://pas-https' } })); ok(r.status === 400, 'abonnement invalide refusé');
  /* tournée : un envoi sans contenu au bon service, abonnement expiré effacé */
  await P.stock().ecrire('uid-2', c, { abonnement: { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/zzz' }, jours: [{ j: 5 }], attente: [] });
  const E = []; DEP.maintenant = () => T;
  DEP.fetch = async (url, o) => { E.push({ url, o }); return new Response(null, { status: /mozilla/.test(url) ? 410 : 201 }); };
  const res = await P.tournee('2026-11-05');
  ok(res.envoyes === 1 && res.effaces === 1 && !M.has('abonnement/uid-2') && E.length === 2 && E.every(x => /^vapid t=.+, k=/.test(x.o.headers.authorization) && !x.o.body && x.o.headers.ttl === '86400'), 'tournée : notification sans contenu envoyée, abonnement expiré effacé');
  E.length = 0; ok((await P.tournee('2026-11-06')).envoyes === 0 && !E.length, 'tournée : personne à prévenir, aucun envoi');
  r = await route(rq('DELETE')); ok(r.status === 200 && !M.has('abonnement/uid-1'), 'désabonnement');
  for (const f of ['push-cle', 'push-abonnement', 'rappels-push']) { const m = await F('netlify/functions/' + f + '.mjs'); ok(typeof m.default === 'function' && (m.config.path || m.config.schedule), 'fonction Netlify ' + f); }
  console.log('push :', n, 'contrôles réussis');
})().catch(e => { console.error(e); process.exit(1); });
