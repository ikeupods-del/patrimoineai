// Fonction planifiée Netlify : chaque matin, notification push aux abonnés qui ont un versement attendu ou à confirmer (push/push.mjs)
import { tournee } from '../../push/push.mjs';

export default async () => { const r = await tournee(); console.log('rappels push :', JSON.stringify(r)); };
export const config = { schedule: '17 6 * * *' };
