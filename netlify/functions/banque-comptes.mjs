// Fonction Netlify : code commun dans banque/routes/comptes.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/comptes.mjs';
export const config = { path: '/api/banque/comptes' };
