// Patrimoine AI — notifications push des rappels de versement, application fermée (hébergement Netlify facultatif, voir docs/PUSH.md).
// Le serveur ne connaît ni les montants ni les plateformes : seulement l'adresse d'envoi du navigateur, les jours du mois des rappels
// et les dates encore à confirmer. La notification part sans contenu ; le service worker de l'appareil compose le texte (sw.js).
// Clés VAPID dans les variables d'environnement (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT), jamais dans le dépôt.
import crypto from 'node:crypto';
import { sceller, ouvrir, DEP } from '../banque/commun.mjs';
import CL from '../calculs.js'; /* mêmes calculs que l'application (jours ouvrés, fériés) */
const env = k => String((DEP.env || process.env)[k] || '').trim();
const b64u = b => Buffer.from(b).toString('base64url');
const deB64u = s => Buffer.from(String(s || '').replace(/=+$/, ''), 'base64url');

export function confPush() {
  const pub = env('VAPID_PUBLIC_KEY'), priv = env('VAPID_PRIVATE_KEY'), sujet = env('VAPID_SUBJECT') || 'mailto:contact@quentools.fr';
  return { pub, priv, sujet, configure: !!(pub && priv && deB64u(pub).length === 65 && deB64u(priv).length === 32), cle: { cleStockage: 'push|' + priv } };
}

/* Jeton VAPID (JWT ES256) pour le service push du navigateur (origine de l'adresse d'envoi), valable 12 h */
export function jetonVapid(endpoint, c, maintenant = Date.now()) {
  const P = deB64u(c.pub), cle = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(P.subarray(1, 33)), y: b64u(P.subarray(33, 65)), d: b64u(deB64u(c.priv)) } });
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' })), p = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(maintenant / 1000) + 12 * 3600, sub: c.sujet }));
  const sig = crypto.sign('sha256', Buffer.from(h + '.' + p), { key: cle, dsaEncoding: 'ieee-p1363' });
  return h + '.' + p + '.' + b64u(sig);
}

/* Faut-il prévenir aujourd'hui ? Le jour d'une échéance (jours des rappels, décalés au jour ouvré), puis 3 et 10 jours après une date
   encore à confirmer. a : {jours: [{j, ouvre}], attente: ['AAAA-MM-JJ']} */
export function aPrevenir(a, auj) {
  const mois = auj.slice(0, 7), ech = (a.jours || []).map(x => CL.echeanceR({ jour: x.j, ouvre: x.ouvre }, mois)), ecart = d => Math.round((Date.parse(auj) - Date.parse(d)) / 864e5);
  return ech.includes(auj) || (a.attente || []).some(d => [0, 3, 10].includes(ecart(d)));
}

/* Envoi d'une notification sans contenu (le service worker affiche le texte) → statut HTTP du service push */
export async function envoyer(abonnement, c) {
  const r = await DEP.fetch(abonnement.endpoint, { method: 'POST', headers: { authorization: 'vapid t=' + jetonVapid(abonnement.endpoint, c, DEP.maintenant()) + ', k=' + c.pub, ttl: '86400', urgency: 'normal', 'content-length': '0' } });
  return r.status;
}

/* Abonnements gardés dans Netlify Blobs (store « patrimoine-push »), un par compte Google, chiffrés */
export function stockagePush(getStore) {
  const store = async () => (await getStore())({ name: 'patrimoine-push', consistency: 'strong' }), cle = uid => 'abonnement/' + String(uid).replace(/[^\w-]/g, '_');
  return {
    async lire(uid, c) { const t = await (await store()).get(cle(uid)); return t ? ouvrir(t, c.cle) : null; },
    async ecrire(uid, c, o) { await (await store()).set(cle(uid), sceller(o, c.cle)); },
    async effacer(uid) { await (await store()).delete(cle(uid)); },
    async tous() { const s = await store(), L = await s.list({ prefix: 'abonnement/' }); return (L.blobs || []).map(b => b.key.slice('abonnement/'.length)); }
  };
}
export const DEP_PUSH = { stockage: null };
export const stock = () => DEP_PUSH.stockage || (DEP_PUSH.stockage = stockagePush(async () => (await import('@netlify/blobs')).getStore));

/* Tournée quotidienne : prévient les abonnés concernés, efface les abonnements expirés (404, 410). → {envoyes, effaces, erreurs} */
export async function tournee(auj = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })) {
  const c = confPush(), out = { envoyes: 0, effaces: 0, erreurs: 0 };
  if (!c.configure) return Object.assign(out, { configure: false });
  for (const uid of await stock().tous()) {
    try {
      const a = await stock().lire(uid, c); if (!a || !a.abonnement || !a.abonnement.endpoint) continue;
      if (!aPrevenir(a, auj)) continue;
      const st = await envoyer(a.abonnement, c);
      if (st === 404 || st === 410) { await stock().effacer(uid); out.effaces++; } else if (st >= 200 && st < 300) out.envoyes++; else out.erreurs++;
    } catch (e) { out.erreurs++; }
  }
  return out;
}
