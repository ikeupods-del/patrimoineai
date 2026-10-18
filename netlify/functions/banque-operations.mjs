// GET /api/banque/operations?compte=uid&depuis=AAAA-MM-JJ[&suite=clé] : opérations d'un compte (GET /accounts/{uid}/transactions),
// page après page avec la « continuation_key ». Pour rester sous la limite de durée de Netlify, la fonction s'arrête
// après quelques secondes et renvoie « suite » : la page la rappelle avec cette clé.
import { fonction, stockage, Erreur, DEP } from '../banque/commun.mjs';
import { eb, etatLie, operation, noterExpire } from '../banque/enable-banking.mjs';

const MAX_JOUR = 300; /* appels par jour et par utilisateur : protège la banque d'une boucle */

export default fonction(['GET'], async ({ c, u, psu, url }) => {
  const e = await etatLie(u, c), uid = url.searchParams.get('compte') || '', suite = url.searchParams.get('suite') || '';
  if (!(e.comptes || []).some(k => k.uid === uid)) throw new Erreur('requete', 'Compte inconnu pour cette banque.', 400);
  let depuis = url.searchParams.get('depuis') || '';
  const min = new Date(DEP.maintenant() - 730 * 864e5).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(depuis) || depuis < min) depuis = new Date(DEP.maintenant() - 90 * 864e5).toISOString().slice(0, 10);
  const j = new Date(DEP.maintenant()).toISOString().slice(0, 10);
  e.appels = e.appels && e.appels.j === j ? e.appels : { j, n: 0 };
  if (e.appels.n >= MAX_JOUR) throw new Erreur('limite', 'Trop de consultations aujourd’hui : réessayez demain.', 429);
  const t0 = DEP.maintenant(), out = [];
  let cle = suite || null, pages = 0;
  try {
    do {
      const q = '?date_from=' + depuis + (cle ? '&continuation_key=' + encodeURIComponent(cle) : '');
      const r = await eb(c, 'GET', '/accounts/' + encodeURIComponent(uid) + '/transactions' + q, { psu, ms: 6000 });
      (r.transactions || []).forEach(t => { const o = operation(t); if (o) out.push(o); });
      pages++; const n = r.continuation_key || null;
      cle = n && n !== cle ? n : null;
    } while (cle && pages < 10 && DEP.maintenant() - t0 < 4500);
  } catch (x) { await noterExpire(u, c, e, x); throw x; }
  e.appels.n += pages; await stockage().ecrire(u, c, e);
  return { operations: out, suite: cle, depuis };
});
export const config = { path: '/api/banque/operations' };
