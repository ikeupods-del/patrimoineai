// GET /api/banque/diagnostic : vérifie, ligne par ligne, que tout est en place (clés, application Enable Banking, adresse de
// retour, banque, stockage) et dit précisément ce qui manque. Aucune donnée bancaire n'est lue.
import { fonction, stockage, manquantes } from '../banque/commun.mjs';
import { eb, jetonEB, choisirBanque, API } from '../banque/enable-banking.mjs';

const sans = u => String(u || '').replace(/\/+$/, '');

export default fonction(['GET'], async ({ c, u }) => {
  const L = [], ligne = (ok, titre, detail) => L.push({ ok, titre, detail: detail || '' });
  const m = manquantes(c);
  ligne(!m.length, 'Variables Netlify', m.length ? 'Manquantes : ' + m.join(', ') + '.' : c.simulation ? 'Mode démonstration (ENABLE_MOCK=1) : aucune vraie banque n’est interrogée.' : 'ENABLE_APP_ID, ENABLE_PRIVATE_KEY et ENABLE_REDIRECT_URL sont renseignées.');
  if (c.mockIgnore) ligne(false, 'ENABLE_MOCK ignoré', 'De vraies clés sont présentes : la démonstration est désactivée. Retirez ENABLE_MOCK.');
  ligne(c.emails.length ? true : null, 'Accès réservé', c.emails.length ? 'Seules ' + c.emails.length + ' adresse(s) Google autorisée(s).' : 'ENABLE_ALLOWED_EMAILS n’est pas renseignée : tout compte Google connecté pourrait utiliser la liaison. Renseignez votre adresse.');
  try { await stockage().lire(u, c); ligne(true, 'Stockage Firestore', 'Lecture de votre compte possible.'); }
  catch (e) { ligne(false, 'Stockage Firestore', e.message); }
  if (c.simulation) { ligne(true, 'Banque', 'Boursorama (démonstration).'); return { lignes: L, ok: !L.some(x => x.ok === false) }; }
  if (m.length) return { lignes: L, ok: false };
  try { jetonEB(c); ligne(true, 'Clé privée', 'Lisible, jeton signé (RS256).'); } catch (e) { ligne(false, 'Clé privée', e.message); return { lignes: L, ok: false }; }
  try {
    const a = await eb(c, 'GET', '/application');
    ligne(true, 'Application Enable Banking', [a.name || a.description || 'Application reconnue', a.environment ? 'environnement ' + a.environment : '', a.active === false ? 'INACTIVE' : ''].filter(Boolean).join(', ') + '.');
    if (a.active === false) ligne(false, 'Application active', 'Enable Banking indique qu’elle est inactive : activez-la dans le Control Panel.');
    const R = Array.isArray(a.redirect_urls) ? a.redirect_urls : null;
    if (R) ligne(R.map(sans).includes(sans(c.retour)), 'Adresse de retour', R.map(sans).includes(sans(c.retour)) ? sans(c.retour) + ' est déclarée chez Enable Banking.' : 'ENABLE_REDIRECT_URL (' + sans(c.retour) + ') n’est pas dans la liste déclarée chez Enable Banking (' + (R.join(', ') || 'vide') + '). Elles doivent être identiques.');
    else ligne(null, 'Adresse de retour', 'Enable Banking n’a pas indiqué les adresses déclarées : vérifiez dans le Control Panel qu’elle est identique à ' + sans(c.retour) + '.');
  } catch (e) { ligne(false, 'Application Enable Banking', e.code === 'configuration' ? 'Enable Banking refuse la clé : ENABLE_APP_ID et ENABLE_PRIVATE_KEY ne correspondent pas à la même application.' : e.message); return { lignes: L, ok: false }; }
  try { const b = await choisirBanque(c); ligne(true, 'Banque', b.name + ' (' + b.country + ')' + (b.max ? ', accord de ' + Math.floor(b.max / 86400) + ' jours au plus' : '') + '.'); }
  catch (e) { ligne(false, 'Banque', e.message); }
  ligne(null, 'API', API);
  return { lignes: L, ok: !L.some(x => x.ok === false) };
});
export const config = { path: '/api/banque/diagnostic' };
