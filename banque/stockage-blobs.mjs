// Patrimoine AI — stockage de la session bancaire dans Netlify Blobs (hébergement facultatif sur Netlify, voir docs/BANQUE.md).
// Une entrée par compte Google (uid vérifié par commun.mjs), chiffrée AES-256-GCM avec une clé que seul le serveur connaît
// (ENABLE_STORE_KEY, à défaut dérivée de la clé privée) : Netlify ne peut pas lire l'identifiant de session. Aucun identifiant
// ni mot de passe bancaire n'est stocké.
import { sceller, ouvrir } from './commun.mjs';

const cle = u => 'session/' + String(u.uid).replace(/[^\w-]/g, '_');

/* getStore : fonction de @netlify/blobs (remplaçable par les tests) ; appelée à chaque opération, dans le contexte de la requête */
export function stockageBlobs(getStore, nom = 'patrimoine-banque') {
  const store = async () => { const g = await getStore(); return g({ name: nom, consistency: 'strong' }); };
  return {
    async lire(u, c) { const t = await (await store()).get(cle(u)); return t ? ouvrir(t, c) : null; },
    async ecrire(u, c, obj) { await (await store()).set(cle(u), sceller(obj, c)); },
    async effacer(u, c) { await (await store()).delete(cle(u)); }
  };
}
