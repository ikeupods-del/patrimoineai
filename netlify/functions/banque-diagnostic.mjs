// Fonction Netlify : code commun dans banque/routes/diagnostic.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/diagnostic.mjs';
export const config = { path: '/api/banque/diagnostic' };
