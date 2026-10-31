// Patrimoine AI — réglage des fonctions bancaires hébergées sur Netlify : sessions dans Netlify Blobs au lieu de Firestore.
// Importé en premier par chaque fonction de netlify/functions/. Sans effet dans l'application Mac (qui ne charge pas ce fichier).
import { DEP } from './commun.mjs';
import { stockageBlobs } from './stockage-blobs.mjs';

if (!DEP.stockage) DEP.stockage = stockageBlobs(async () => (await import('@netlify/blobs')).getStore);
