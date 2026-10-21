// POST /api/banque/demarrer : prépare l'accord avec la banque (POST /auth) et renvoie l'adresse de connexion bancaire.
// Le « state » aléatoire est gardé côté serveur et vérifié au retour.
import crypto from 'node:crypto';
import { fonction, stockage, manquantes, Erreur, DEP, SANS_CLE } from '../commun.mjs';
import { eb, choisirBanque, adresseRetour } from '../enable-banking.mjs';

export default fonction(['POST'], async ({ c, u, psu }) => {
  const m = manquantes(c);
  if (m.length) throw new Erreur('non_configure', c.local ? SANS_CLE : 'La liaison bancaire n’est pas encore configurée sur le serveur (' + m.join(', ') + ').', 503);
  if (!c.simulation && !/^https:\/\//.test(c.retour)) throw new Erreur('non_configure', 'ENABLE_REDIRECT_URL doit être une adresse https (celle de l’application).', 503);
  const b = await choisirBanque(c), retour = await adresseRetour(c);
  /* Durée de l'accord : 90 jours, ou moins si la banque l'impose */
  const jours = Math.max(1, Math.min(90, b.max ? Math.floor(b.max / 86400) : 90)), valid = new Date(DEP.maintenant() + jours * 864e5).toISOString();
  const state = DEP.prefixeEtat + crypto.randomBytes(24).toString('hex');
  const r = await eb(c, 'POST', '/auth', { corps: { access: { valid_until: valid }, aspsp: { name: b.name, country: b.country }, state, redirect_url: retour || 'https://simulation.invalid/', psu_type: 'personal' }, psu });
  /* adresse https ; en démonstration, le retour peut viser un poste local (netlify dev) */
  if (!r || !(c.simulation ? /^https?:\/\// : /^https:\/\//).test(r.url || '')) throw new Erreur('requete', 'Enable Banking n’a pas renvoyé d’adresse de connexion à la banque.', 502);
  const e = (await stockage().lire(u, c)) || {};
  e.attente = { state, exp: DEP.maintenant() + 30 * 60e3, banque: b.name, valid };
  await stockage().ecrire(u, c, e);
  return { url: r.url, banque: b.name, jours };
});
export const config = { path: '/api/banque/demarrer' };
