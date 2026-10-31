// Fonction Netlify : code commun dans banque/routes/deconnecter.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/deconnecter.mjs';
export const config = { path: '/api/banque/deconnecter' };
