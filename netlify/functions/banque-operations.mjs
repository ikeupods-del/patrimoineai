// Fonction Netlify : code commun dans banque/routes/operations.mjs ; sessions dans Netlify Blobs (banque/netlify.mjs)
import '../../banque/netlify.mjs';
export { default } from '../../banque/routes/operations.mjs';
export const config = { path: '/api/banque/operations' };
