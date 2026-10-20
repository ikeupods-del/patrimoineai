// Patrimoine AI — client de l'API Enable Banking (open banking DSP2), appelé uniquement par les fonctions bancaires (banque/routes).
// Documentation suivie : https://enablebanking.com/docs/api/reference/ et les exemples officiels
// (github.com/enablebanking/enablebanking-api-samples) : jeton JWT RS256, /aspsps, /auth, /sessions, /accounts.
import crypto from 'node:crypto';
import { DEP, Erreur, requete, stockage, SANS_CLE } from './commun.mjs';
import { simuler } from './simulateur.mjs';

export const API = 'https://api.enablebanking.com';

/* Jeton d'accès de l'application : JWT signé RS256 avec sa clé privée, valable une heure au plus, refait à chaque appel */
const b64u = s => Buffer.from(s).toString('base64url');
export function jetonEB(c) {
  if (!c.appId || !c.cle) throw new Erreur('non_configure', c.local ? SANS_CLE : 'La liaison bancaire n’est pas encore configurée sur le serveur (ENABLE_APP_ID, ENABLE_PRIVATE_KEY).', 503);
  const t = Math.floor(DEP.maintenant() / 1000);
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: c.appId }));
  const p = b64u(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: t, exp: t + 3600 }));
  let k;
  try { k = crypto.createPrivateKey(c.cle); } catch (e) { throw new Erreur('non_configure', c.local ? 'Le fichier .pem enregistré est illisible : choisissez de nouveau le fichier téléchargé chez Enable Banking.' : 'La clé privée ENABLE_PRIVATE_KEY est illisible : collez le contenu complet du fichier .pem.', 503); }
  return h + '.' + p + '.' + b64u(crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), k));
}

/* Erreurs de l'API ({ code, message, error, detail }) traduites en messages compréhensibles */
function erreurEB(st, d, chemin) {
  const m = String(d.message || d.error_description || '') + ' ' + (d.detail ? JSON.stringify(d.detail) : ''), e = String(d.error || '').toUpperCase(), t = (m + ' ' + e).toLowerCase();
  const session = /^\/(sessions|accounts)\//.test(chemin);
  if (session && (/expired|closed|revoked|session|consent|unauthori[sz]ed/.test(t) || st === 401 || st === 404)) return new Erreur('consentement_expire', 'Votre accord d’accès à la banque a expiré ou a été retiré : touchez « Renouveler ».', 401);
  if (st === 429 || /rate.?limit|too many/.test(t)) return new Erreur('limite', 'La banque limite le nombre de consultations (règle de la DSP2) : réessayez dans quelques heures.', 429);
  if (st >= 500 || /aspsp|bank.*(unavailable|error)|service unavailable|maintenance/.test(t)) return new Erreur('banque_indisponible', 'La banque ne répond pas pour le moment. Vos derniers soldes restent affichés ; réessayez plus tard.', 502);
  if (st === 401 || st === 403) return new Erreur('configuration', 'Enable Banking refuse l’accès de l’application : vérifiez que le fichier .pem est celui de l’application (ENABLE_APP_ID, ENABLE_PRIVATE_KEY), qu’elle est active et que votre compte est bien lié dans le Control Panel.', 502);
  return new Erreur('requete', 'Enable Banking a refusé la demande' + (m.trim() ? ' : ' + m.trim().slice(0, 180) : '.'), 502);
}

/* Appel de l'API ; psu = présence de l'utilisateur (IP et navigateur) pour échapper à la limite des 4 accès par jour */
export async function eb(c, methode, chemin, { corps, psu, ms = 8000 } = {}) {
  if (c.simulation) return simuler(methode, chemin, corps);
  const h = { authorization: 'Bearer ' + jetonEB(c), accept: 'application/json' };
  if (corps) h['content-type'] = 'application/json';
  if (psu) { h['Psu-Ip-Address'] = psu.ip; if (psu.ua) h['Psu-User-Agent'] = psu.ua; }
  const r = await requete(API + chemin, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined }, ms, 'Enable Banking');
  const txt = await r.text();
  let d = {};
  try { d = txt ? JSON.parse(txt) : {}; } catch (e) { d = { message: txt.slice(0, 200) }; }
  if (!r.ok) throw erreurEB(r.status, d, chemin);
  return d;
}

/* La banque visée (Boursorama par défaut, devenue BoursoBank) : nom exact lu dans la liste des banques d'Enable Banking */
let ASPSPS = { at: 0, pays: '', L: [] };
export async function choisirBanque(c) {
  if (!ASPSPS.L.length || ASPSPS.pays !== c.pays || DEP.maintenant() - ASPSPS.at > 864e5) {
    const d = await eb(c, 'GET', '/aspsps?country=' + encodeURIComponent(c.pays));
    ASPSPS = { at: DEP.maintenant(), pays: c.pays, L: Array.isArray(d.aspsps) ? d.aspsps : [] };
  }
  const L = ASPSPS.L, voulu = (c.banque || '').toLowerCase();
  const b = voulu ? L.find(x => String(x.name).toLowerCase() === voulu) : L.find(x => /bourso/i.test(x.name || ''));
  if (!b) throw new Erreur('banque_introuvable', (c.banque || 'Boursorama') + ' n’apparaît pas dans la liste des banques d’Enable Banking (' + c.pays + ') : indiquez son nom exact dans ENABLE_ASPSP_NAME.', 502);
  return { name: b.name, country: b.country || c.pays, max: +b.maximum_consent_validity || 0 };
}

/* Certains accords ne donnent que l'identifiant des comptes : le nom et l'IBAN sont alors demandés un à un (sans bloquer si la banque ne les fournit pas) */
export async function comptesComplets(c, L, psu) {
  return Promise.all((L || []).map(async a => {
    const o = typeof a === 'string' ? { uid: a } : a;
    if (!o || !o.uid || o.name || o.product || o.account_id) return o;
    try { const d = await eb(c, 'GET', '/accounts/' + encodeURIComponent(o.uid) + '/details', { psu, ms: 5000 }); return Object.assign({}, d, { uid: o.uid }); }
    catch (e) { return o; }
  }));
}
/* Compte tel que gardé et renvoyé : jamais l'IBAN complet ; « ref » est une empreinte stable d'un accord à l'autre */
const TYPES = { CACC: 'Compte courant', SVGS: 'Compte d’épargne', CARD: 'Carte', LOAN: 'Crédit', CASH: 'Compte espèces', TRAN: 'Compte de transactions', MOMA: 'Compte espèces', OTHR: 'Autre compte' };
export function compte(a) {
  if (typeof a === 'string') a = { uid: a };
  const iban = String((a.account_id && (a.account_id.iban || (a.account_id.other && a.account_id.other.identification))) || '').replace(/\s/g, '');
  const type = String(a.cash_account_type || '').toUpperCase();
  return {
    uid: String(a.uid), ref: crypto.createHash('sha256').update('compte|' + (iban || a.uid)).digest('hex').slice(0, 16),
    nom: String(a.name || a.product || TYPES[type] || 'Compte').slice(0, 60), type, produit: String(a.product || '').slice(0, 60),
    devise: a.currency || 'EUR', iban4: iban ? iban.slice(-4) : ''
  };
}
/* Solde retenu : comptable de clôture, sinon disponible, sinon le premier fourni */
const ORDRE = ['CLBD', 'ITBD', 'CLAV', 'ITAV', 'XPCD', 'OPBD', 'PRCD', 'OTHR'];
export function solde(L) {
  const B = (Array.isArray(L) ? L : []).filter(b => b && b.balance_amount && isFinite(parseFloat(b.balance_amount.amount)));
  if (!B.length) return null;
  const b = B.slice().sort((x, y) => (ORDRE.indexOf(x.balance_type) + 1 || 99) - (ORDRE.indexOf(y.balance_type) + 1 || 99))[0];
  return { montant: Math.round(parseFloat(b.balance_amount.amount) * 100) / 100, devise: b.balance_amount.currency || 'EUR', type: b.balance_type || '', date: b.reference_date || '' };
}
/* Opération normalisée : date, libellé lisible, montant signé (débit négatif), identifiant stable */
/* Zones SEPA structurées : les références (EREF+, MREF+…) sont écartées, les textes et les noms (SVWZ+, CDTR+…) gardés sans préfixe */
const SEPA_REF = /^(?:EREF|KREF|MREF|CRED|IBAN|BIC|COAM|OAMT|SQTP|PURP|RTRN|REJT|SDVA|INDA|NTAV)\+/, SEPA = /^(?:SVWZ|SVCL|REFE|REMI|DBTR|CDTR|ULTC|ULTD|ULTB|ABWA|ABWE)\+/;
export function operation(t) {
  if (!t || !t.transaction_amount) return null;
  const v = parseFloat(String(t.transaction_amount.amount).replace(',', '.'));
  if (!isFinite(v)) return null;
  const m = t.credit_debit_indicator === 'DBIT' ? -Math.abs(v) : t.credit_debit_indicator === 'CRDT' ? Math.abs(v) : v;
  const d = String(t.booking_date || t.value_date || t.transaction_date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const ri = (Array.isArray(t.remittance_information) ? t.remittance_information : [t.remittance_information]).filter(Boolean).map(s => String(s).trim()).filter(s => !SEPA_REF.test(s)).map(s => s.replace(SEPA, '').trim()).filter(Boolean);
  const tiers = m > 0 ? t.debtor && t.debtor.name : t.creditor && t.creditor.name;
  const txt = ri.join(' '), nom = tiers && !txt.toUpperCase().includes(String(tiers).toUpperCase()) ? [tiers] : []; /* le nom du tiers n'est ajouté que s'il manque */
  const lib = nom.concat(ri).filter((x, i, A) => A.indexOf(x) === i).join(' ').replace(/\s+/g, ' ').trim().slice(0, 140) || 'Opération';
  const id = t.entry_reference || t.transaction_id || crypto.createHash('sha256').update([d, m, lib, t.value_date || ''].join('|')).digest('hex').slice(0, 24);
  return { id: String(id).slice(0, 80), d, lib, m: Math.round(m * 100) / 100, dev: t.transaction_amount.currency || 'EUR', etat: t.status === 'PDNG' ? 'PDNG' : 'BOOK' };
}

/* --- État de la liaison gardé pour l'utilisateur --- */
export const expire = (e, c) => !e || !e.sid || (e.statut && e.statut !== 'AUTHORIZED') || (e.valid && Date.parse(e.valid) < DEP.maintenant());
export const resume = (e, c) => !e || !e.sid
  ? { configure: true, simulation: c.simulation, mockIgnore: c.mockIgnore, lie: false }
  : { configure: true, simulation: c.simulation, mockIgnore: c.mockIgnore, lie: true, banque: e.banque, valid: e.valid, liee: e.liee, statut: expire(e, c) ? 'expire' : 'actif', comptes: e.comptes || [] };
export async function etatLie(u, c) {
  const e = await stockage().lire(u, c);
  if (!e || !e.sid) throw new Erreur('non_lie', 'Aucune banque n’est liée pour le moment.', 409);
  if (expire(e, c)) throw new Erreur('consentement_expire', 'Votre accord d’accès à la banque a expiré : touchez « Renouveler ».', 401);
  return e;
}
/* Un accord expiré ou retiré est noté, pour l'afficher sans redemander à la banque */
export async function noterExpire(u, c, e, x) {
  if (x && x.code === 'consentement_expire' && e && e.statut !== 'EXPIRED') { e.statut = 'EXPIRED'; try { await stockage().ecrire(u, c, e); } catch (y) { /* sans gravité */ } }
}
