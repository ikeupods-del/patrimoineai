// Génère une paire de clés VAPID pour les notifications push : node push/cles-vapid.mjs
// Copiez les deux valeurs dans Netlify (Site configuration → Environment variables). Ne les mettez jamais dans le dépôt.
import crypto from 'node:crypto';
const k = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), j = k.privateKey.export({ format: 'jwk' });
console.log('VAPID_PUBLIC_KEY=' + Buffer.concat([Buffer.from([4]), Buffer.from(j.x, 'base64url'), Buffer.from(j.y, 'base64url')]).toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + j.d);
console.log('VAPID_SUBJECT=mailto:votre-adresse@exemple.fr');
