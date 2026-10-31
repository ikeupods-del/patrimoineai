// GET /api/push/cle : les notifications push sont-elles configurées ? Clé publique VAPID (publique par nature) pour s'abonner.
import { fonction } from '../../banque/commun.mjs';
import { confPush } from '../push.mjs';

export default fonction(['GET'], async () => { const c = confPush(); return c.configure ? { configure: true, cle: c.pub } : { configure: false, manque: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'].filter(k => !process.env[k]) }; });
export const config = { path: '/api/push/cle' };
