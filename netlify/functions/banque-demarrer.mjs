// Fonction Netlify : code commun dans banque/routes/demarrer.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/demarrer.mjs';
export const config = { path: '/api/banque/demarrer' };
