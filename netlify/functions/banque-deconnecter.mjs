// POST ou DELETE /api/banque/deconnecter : révoque la session chez Enable Banking (DELETE /sessions/{id}) et l'efface du compte.
import { fonction, stockage } from '../banque/commun.mjs';
import { eb } from '../banque/enable-banking.mjs';

export default fonction(['POST', 'DELETE'], async ({ c, u }) => {
  const e = await stockage().lire(u, c);
  let revoquee = false;
  if (e && e.sid) { try { await eb(c, 'DELETE', '/sessions/' + encodeURIComponent(e.sid)); revoquee = true; } catch (x) { /* déjà expirée ou banque injoignable : effacée quand même */ } }
  await stockage().effacer(u, c);
  return { configure: true, lie: false, revoquee };
});
export const config = { path: '/api/banque/deconnecter' };
