// Patrimoine AI — fonctions serveur facultatives (notifications push des rappels, hébergées sur Netlify) : réglages, compte Google
// vérifié, chiffrement, réponses. Aucune clé dans le dépôt : variables d'environnement seulement (voir docs/PUSH.md).
import crypto from 'node:crypto';

/* Dépendances remplaçables par les tests : réseau, horloge, vérification du compte Google, réglages */
export const DEP = { fetch: (...a) => globalThis.fetch(...a), maintenant: () => Date.now(), utilisateur: null, env: null };

export class Erreur extends Error {
  constructor(code, message, statut = 400) { super(message); this.code = code; this.statut = statut; }
}

const env = k => String((DEP.env || process.env)[k] || '').trim();
/* Réglages : projet Firebase (comptes Google), comptes autorisés, sites autorisés à appeler les fonctions.
   Les anciens noms ENABLE_ALLOWED_EMAILS / ENABLE_ALLOWED_ORIGINS restent acceptés. */
export function conf() {
  return {
    projet: env('FIREBASE_PROJECT_ID') || 'quentools-adca1',
    emails: (env('ALLOWED_EMAILS') || env('ENABLE_ALLOWED_EMAILS')).toLowerCase().split(/[,;\s]+/).filter(Boolean),
    origines: (env('ALLOWED_ORIGINS') || env('ENABLE_ALLOWED_ORIGINS') || 'https://ikeupods-del.github.io').split(/[,\s]+/).filter(Boolean).map(o => o.replace(/\/$/, ''))
  };
}

/* --- Requête avec délai maximal (Netlify coupe une fonction au bout de 10 s) --- */
export async function requete(url, opt, ms = 8000, quoi = 'Le service') {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { return await DEP.fetch(url, Object.assign({}, opt, { signal: ctl.signal })); }
  catch (e) { throw e && e.name === 'AbortError' ? new Erreur('delai', quoi + ' met trop de temps à répondre. Réessayez dans quelques minutes.', 504) : new Erreur('reseau', quoi + ' est injoignable pour le moment.', 502); }
  finally { clearTimeout(t); }
}

/* --- Compte Google : même connexion que l'application (Firebase Auth). Le jeton d'identité est vérifié ici
   avec les clés publiques de Google : signature RS256, projet, émetteur, dates. --- */
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
let JWKS = { cles: null, exp: 0 };
async function clesGoogle(neuves) {
  if (!neuves && JWKS.cles && JWKS.exp > DEP.maintenant()) return JWKS.cles;
  const r = await requete(JWKS_URL, {}, 5000, 'Le service de connexion Google');
  if (!r.ok) throw new Erreur('auth_indisponible', 'Vérification du compte Google impossible pour le moment.', 503);
  const j = await r.json(), age = +((/max-age=(\d+)/.exec(r.headers.get('cache-control') || '') || [])[1] || 3600);
  JWKS = { cles: Object.fromEntries((j.keys || []).map(k => [k.kid, k])), exp: DEP.maintenant() + Math.min(age, 86400) * 1000 };
  return JWKS.cles;
}
const b64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const refus = () => new Erreur('connexion_requise', 'Connexion Google expirée ou invalide : reconnectez-vous dans les réglages.', 401);
export async function verifierJeton(jeton, projet) {
  const p = String(jeton || '').split('.');
  if (p.length !== 3) throw refus();
  let h, c;
  try { h = JSON.parse(b64u(p[0])); c = JSON.parse(b64u(p[1])); } catch (e) { throw refus(); }
  if (h.alg !== 'RS256' || !h.kid) throw refus();
  let k = (await clesGoogle())[h.kid];
  if (!k) k = (await clesGoogle(true))[h.kid]; /* Google renouvelle ses clés : une seconde lecture */
  if (!k) throw refus();
  let ok = false;
  try { ok = crypto.verify('RSA-SHA256', Buffer.from(p[0] + '.' + p[1]), crypto.createPublicKey({ key: k, format: 'jwk' }), b64u(p[2])); } catch (e) { ok = false; }
  const t = Math.floor(DEP.maintenant() / 1000);
  if (!ok || c.aud !== projet || c.iss !== 'https://securetoken.google.com/' + projet || !(c.exp > t) || !(c.iat <= t + 300) || typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) throw refus();
  return { uid: c.sub, email: String(c.email || '').toLowerCase(), emailVerifie: c.email_verified === true, jeton };
}
async function utilisateur(req, c) {
  const a = req.headers.get('authorization') || '', m = /^Bearer\s+(\S+)$/i.exec(a);
  if (!m) throw new Erreur('connexion_requise', 'Connectez-vous avec Google dans les réglages de l’application.', 401);
  const u = await verifierJeton(m[1], c.projet);
  if (c.emails.length && !(u.emailVerifie && c.emails.includes(u.email))) throw new Erreur('acces_refuse', 'Ce compte Google n’est pas autorisé à utiliser ce service.', 403);
  return u;
}

/* --- Chiffrement des données gardées par le serveur (AES-256-GCM, clé connue du seul serveur) --- */
const cleChiffrement = c => crypto.createHash('sha256').update('patrimoine-serveur-v1|' + (c.cleStockage || 'simulation')).digest();
export function sceller(obj, c) {
  const iv = crypto.randomBytes(12), ci = crypto.createCipheriv('aes-256-gcm', cleChiffrement(c), iv);
  const ct = Buffer.concat([ci.update(JSON.stringify(obj), 'utf8'), ci.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), t: ci.getAuthTag().toString('base64'), ct: ct.toString('base64') });
}
export function ouvrir(txt, c) {
  try {
    const o = JSON.parse(txt), d = crypto.createDecipheriv('aes-256-gcm', cleChiffrement(c), Buffer.from(o.iv, 'base64'));
    d.setAuthTag(Buffer.from(o.t, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(o.ct, 'base64')), d.final()]).toString('utf8'));
  } catch (e) { return null; } /* clé changée : donnée considérée comme absente */
}
/* --- Réponses et accès depuis la page (CORS) : l'application en ligne et ce site --- */
function cors(req, c) {
  const o = req.headers.get('origin');
  if (!o) return {};
  const soi = new URL(req.url).origin;
  if (o !== soi && !c.origines.includes(o)) return null;
  return { 'access-control-allow-origin': o, 'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS', 'access-control-allow-headers': 'authorization, content-type', 'access-control-max-age': '600', vary: 'origin' };
}
const json = (o, st, h) => new Response(JSON.stringify(o), { status: st, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, h) });
export async function corps(req) {
  const t = await req.text();
  if (t.length > 4000) throw new Erreur('requete', 'Demande trop volumineuse.', 413);
  try { return t ? JSON.parse(t) : {}; } catch (e) { throw new Erreur('requete', 'Demande illisible.', 400); }
}
/* Enveloppe commune : méthode, origine, compte Google, erreurs propres (jamais de détail technique sensible) */
export function fonction(methodes, traiter) {
  return async (req, context) => {
    const c = conf(), h = cors(req, c);
    if (h === null) return json({ code: 'origine', message: 'Origine non autorisée.' }, 403, {});
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    if (!methodes.includes(req.method)) return json({ code: 'methode', message: 'Méthode non prise en charge.' }, 405, h);
    try {
      const u = DEP.utilisateur ? await DEP.utilisateur(req, c) : await utilisateur(req, c);
      return json(await traiter({ req, c, u, url: new URL(req.url) }), 200, h);
    } catch (e) {
      const er = e instanceof Erreur ? e : new Erreur('erreur', 'Erreur inattendue du service. Réessayez plus tard.', 500);
      /* Journal Netlify : code et statut seulement (jamais de jeton, de compte ni de montant), pour comprendre un échec a posteriori */
      if (!(e instanceof Erreur)) console.error('serveur : erreur inattendue', e && e.name, e && e.message);
      else if (er.statut >= 500 || er.statut === 429 || er.code === 'configuration') console.warn('serveur :', JSON.stringify({ route: new URL(req.url).pathname, code: er.code, statut: er.statut }));
      return json({ code: er.code, message: er.message }, er.statut, h);
    }
  };
}
