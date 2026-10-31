// Fonction Netlify : code commun dans banque/routes/etat.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/etat.mjs';
export const config = { path: '/api/banque/etat' };
