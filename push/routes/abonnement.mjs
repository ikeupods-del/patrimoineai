// POST /api/push/abonnement : enregistre l'adresse d'envoi du navigateur, les jours des rappels et les dates à confirmer (rien d'autre).
// DELETE : désabonne. Compte Google vérifié par commun.mjs ; données rangées sous l'uid, chiffrées.
import { fonction, corps, Erreur } from '../../banque/commun.mjs';
import { confPush, stock } from '../push.mjs';

const date = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? String(s) : null;
export default fonction(['POST', 'DELETE'], async ({ req, u }) => {
  const c = confPush();
  if (!c.configure) throw new Erreur('non_configure', 'Les notifications push ne sont pas encore configurées sur le serveur (clés VAPID).', 503);
  if (req.method === 'DELETE') { await stock().effacer(u.uid); return { abonne: false }; }
  const b = await corps(req), ab = b.abonnement || {};
  if (!/^https:\/\//.test(String(ab.endpoint || '')) || String(ab.endpoint).length > 1000) throw new Erreur('requete', 'Abonnement du navigateur invalide.', 400);
  const jours = (Array.isArray(b.jours) ? b.jours : []).slice(0, 20).map(x => ({ j: Math.max(1, Math.min(31, Math.round(+x.j) || 1)), ouvre: x.ouvre !== false }));
  const attente = (Array.isArray(b.attente) ? b.attente : []).map(date).filter(Boolean).slice(0, 40);
  await stock().ecrire(u.uid, c, { abonnement: { endpoint: String(ab.endpoint) }, jours, attente, maj: Date.now() });
  return { abonne: true, jours: jours.length, attente: attente.length };
});
export const config = { path: '/api/push/abonnement' };
