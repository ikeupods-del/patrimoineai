// Fonction Netlify : code commun dans banque/routes/retour.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/retour.mjs';
export const config = { path: '/api/banque/retour' };
