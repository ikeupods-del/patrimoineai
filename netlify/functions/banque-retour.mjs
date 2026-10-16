// POST /api/banque/retour { code, state } : au retour de la banque, vérifie le « state », ouvre la session (POST /sessions)
// et la garde, chiffrée, dans le compte de l'utilisateur. Un ancien accord est révoqué.
import crypto from 'node:crypto';
import { fonction, stockage, corps, Erreur, DEP } from '../banque/commun.mjs';
import { eb, compte, comptesComplets, resume } from '../banque/enable-banking.mjs';

const egal = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export default fonction(['POST'], async ({ req, c, u, psu }) => {
  const { code, state } = await corps(req);
  const e = (await stockage().lire(u, c)) || {}, a = e.attente;
  if (!a || !state || !egal(a.state, state)) throw new Erreur('etat_invalide', 'Ce retour de la banque ne correspond à aucune demande en cours : relancez « Lier ma banque ».', 400);
  if (a.exp < DEP.maintenant()) throw new Erreur('etat_invalide', 'La demande de liaison a expiré (plus de 30 minutes) : relancez « Lier ma banque ».', 400);
  if (!code || String(code).length > 512) throw new Erreur('requete', 'Code d’autorisation absent : la connexion à la banque a été annulée.', 400);
  const s = await eb(c, 'POST', '/sessions', { corps: { code: String(code) }, psu });
  if (!s || !s.session_id) throw new Erreur('requete', 'La banque n’a pas ouvert de session.', 502);
  const ancien = e.sid;
  const n = { sid: s.session_id, banque: (s.aspsp && s.aspsp.name) || a.banque, valid: (s.access && s.access.valid_until) || a.valid, statut: 'AUTHORIZED', liee: DEP.maintenant(), verifie: DEP.maintenant(), comptes: (await comptesComplets(c, s.accounts, psu)).map(compte) };
  await stockage().ecrire(u, c, n);
  if (ancien && ancien !== n.sid) { try { await eb(c, 'DELETE', '/sessions/' + encodeURIComponent(ancien)); } catch (x) { /* déjà expirée */ } }
  return resume(n, c);
});
export const config = { path: '/api/banque/retour' };
