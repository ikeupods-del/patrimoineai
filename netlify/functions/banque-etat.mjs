// GET /api/banque/etat : la liaison bancaire est-elle configurée, active, expirée ? (aucune donnée bancaire demandée à la banque,
// sauf une vérification de l'accord au plus une fois par heure)
import { fonction, stockage, manquantes, DEP } from '../banque/commun.mjs';
import { eb, resume, noterExpire } from '../banque/enable-banking.mjs';

export default fonction(['GET'], async ({ c, u }) => {
  const m = manquantes(c);
  if (m.length) return { configure: false, manque: m };
  const e = await stockage().lire(u, c);
  if (e && e.sid && e.statut !== 'EXPIRED' && DEP.maintenant() - (e.verifie || 0) > 36e5) {
    try {
      const s = await eb(c, 'GET', '/sessions/' + encodeURIComponent(e.sid));
      e.statut = s.status || 'AUTHORIZED'; if (s.access && s.access.valid_until) e.valid = s.access.valid_until;
      e.verifie = DEP.maintenant(); await stockage().ecrire(u, c, e);
    } catch (x) { await noterExpire(u, c, e, x); } /* banque injoignable : l'état connu reste affiché */
  }
  return resume(e, c);
});
export const config = { path: '/api/banque/etat' };
