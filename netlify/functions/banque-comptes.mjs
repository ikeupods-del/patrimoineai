// GET /api/banque/comptes[?force=1] : comptes liés et leurs soldes (GET /accounts/{uid}/balances).
// Soldes gardés 10 minutes (1 minute avec « force ») pour ne pas solliciter la banque à chaque affichage.
import { fonction, stockage, DEP } from '../banque/commun.mjs';
import { eb, etatLie, resume, solde, noterExpire } from '../banque/enable-banking.mjs';

export default fonction(['GET'], async ({ c, u, psu, url }) => {
  const e = await etatLie(u, c), force = url.searchParams.get('force') === '1', age = DEP.maintenant() - (e.soldesAt || 0);
  if (e.soldes && age < (force ? 60e3 : 10 * 60e3)) return Object.assign(resume(e, c), { soldes: e.soldes, at: e.soldesAt, cache: true });
  let premiere = null;
  const L = await Promise.all((e.comptes || []).map(async k => {
    try { const b = await eb(c, 'GET', '/accounts/' + encodeURIComponent(k.uid) + '/balances', { psu }); return [k.uid, solde(b.balances) || { erreur: 'Solde non communiqué par la banque.' }]; }
    catch (x) { premiere = premiere || x; return [k.uid, { erreur: x.message, code: x.code }]; }
  }));
  if (premiere && (premiere.code === 'consentement_expire' || L.every(x => x[1].erreur))) { await noterExpire(u, c, e, premiere); throw premiere; }
  e.soldes = Object.fromEntries(L); e.soldesAt = DEP.maintenant();
  await stockage().ecrire(u, c, e);
  return Object.assign(resume(e, c), { soldes: e.soldes, at: e.soldesAt });
});
export const config = { path: '/api/banque/comptes' };
