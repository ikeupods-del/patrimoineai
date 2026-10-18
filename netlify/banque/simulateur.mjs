// Patrimoine AI — banque de démonstration (ENABLE_MOCK=1) : imite les réponses de l'API Enable Banking, sans réseau
// ni vraie banque, pour essayer tout le parcours (liaison, soldes, opérations paginées, déconnexion) avant les vraies clés.
// Sans état : la session et les comptes se déduisent des identifiants. Rien n'est inventé dans l'application réelle.
import crypto from 'node:crypto';
import { DEP, Erreur } from './commun.mjs';

const jour = k => { const d = new Date(DEP.maintenant()); d.setDate(d.getDate() + k); return d.toISOString().slice(0, 10); };
const COMPTES = [
  { uid: 'demo-courant', account_id: { iban: 'FR7600000000000000000001234' }, name: 'Compte courant (démonstration)', currency: 'EUR', cash_account_type: 'CACC', product: 'Compte de démonstration' },
  { uid: 'demo-livret', account_id: { iban: 'FR7600000000000000000005678' }, name: 'Livret (démonstration)', currency: 'EUR', cash_account_type: 'SVGS', product: 'Livret de démonstration' }
];
/* Opérations de démonstration : salaire, courses, abonnement, et les versements des plateformes le 5 et le 8 */
function operations() {
  const L = [], t = new Date(DEP.maintenant());
  for (let k = 0; k < 3; k++) {
    const m = new Date(t.getFullYear(), t.getMonth() - k, 1), mm = m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0'), d = j => mm + '-' + String(j).padStart(2, '0');
    const add = (j, lib, v, tiers) => { if (d(j) <= jour(0)) L.push({ entry_reference: 'demo-' + mm + '-' + j + '-' + L.length, booking_date: d(j), value_date: d(j), status: 'BOOK', transaction_amount: { amount: Math.abs(v).toFixed(2), currency: 'EUR' }, credit_debit_indicator: v < 0 ? 'DBIT' : 'CRDT', remittance_information: [lib], [v < 0 ? 'creditor' : 'debtor']: tiers ? { name: tiers } : undefined }); };
    add(1, 'VIR SALAIRE DEMONSTRATION', 2450, 'EMPLOYEUR DEMO'); add(3, 'CB CARREFOUR MARKET', -86.4); add(4, 'PRLV SEPA NETFLIX.COM', -13.49);
    add(6, 'VIR SEPA LEMONWAY BIENPRETER REMBOURSEMENT', 42.5, 'BIENPRETER'); add(9, 'VIR SEPA BRICKS LOYERS', 18.3, 'BRICKS'); add(12, 'CB BOULANGERIE', -7.2);
  }
  L.push({ entry_reference: 'demo-attente', transaction_date: jour(0), status: 'PDNG', transaction_amount: { amount: '25.00', currency: 'EUR' }, credit_debit_indicator: 'DBIT', remittance_information: ['CB EN ATTENTE'] });
  return L.sort((a, b) => String(b.booking_date || b.transaction_date).localeCompare(a.booking_date || a.transaction_date));
}

/* Livret de démonstration : un virement depuis le compte courant et les intérêts du mois */
function operationsLivret() {
  return [{ entry_reference: 'demo-livret-1', booking_date: jour(-6), status: 'BOOK', transaction_amount: { amount: '200.00', currency: 'EUR' }, credit_debit_indicator: 'CRDT', remittance_information: ['VIR DE COMPTE COURANT'] },
    { entry_reference: 'demo-livret-2', booking_date: jour(-2), status: 'BOOK', transaction_amount: { amount: '12.50', currency: 'EUR' }, credit_debit_indicator: 'CRDT', remittance_information: ['INTERETS CREDITEURS'] }];
}

export function simuler(methode, chemin, corps) {
  const u = new URL(chemin, 'https://simulation.invalid'), p = u.pathname;
  if (methode === 'GET' && p === '/aspsps') return { aspsps: [{ name: 'Boursorama', country: 'FR', maximum_consent_validity: 7776000, psu_types: ['personal'] }] };
  if (methode === 'POST' && p === '/auth') {
    const r = new URL(corps.redirect_url || 'https://simulation.invalid/');
    r.searchParams.set('code', 'demo-' + crypto.randomBytes(8).toString('hex')); r.searchParams.set('state', corps.state);
    return { url: r.toString(), authorization_id: 'demo-' + crypto.randomBytes(6).toString('hex') };
  }
  if (methode === 'POST' && p === '/sessions') {
    if (!/^demo-/.test(corps && corps.code || '')) throw new Erreur('requete', 'Code d’autorisation inconnu (démonstration).', 400);
    return { session_id: 'demo-session-' + crypto.randomBytes(6).toString('hex'), accounts: COMPTES, aspsp: { name: 'Boursorama', country: 'FR' }, psu_type: 'personal', access: { valid_until: new Date(DEP.maintenant() + 90 * 864e5).toISOString() } };
  }
  if (/^\/sessions\/demo-/.test(p)) return methode === 'DELETE' ? {} : { status: 'AUTHORIZED', accounts: COMPTES.map(a => a.uid), access: { valid_until: new Date(DEP.maintenant() + 89 * 864e5).toISOString() } };
  const m = /^\/accounts\/(demo-[a-z]+)\/(balances|transactions)$/.exec(p);
  if (m && m[2] === 'balances') return { balances: [{ name: 'Solde', balance_type: 'CLBD', reference_date: jour(0), balance_amount: { currency: 'EUR', amount: m[1] === 'demo-courant' ? '1834.27' : '6200.00' } }] };
  if (m) {
    const depuis = u.searchParams.get('date_from') || '0000', L = m[1] === 'demo-courant' ? operations().filter(t => (t.booking_date || t.transaction_date) >= depuis) : operationsLivret().filter(t => t.booking_date >= depuis);
    const page2 = u.searchParams.get('continuation_key') === 'page-2', moitie = Math.ceil(L.length / 2);
    return page2 ? { transactions: L.slice(moitie) } : { transactions: L.slice(0, moitie), continuation_key: L.length > moitie ? 'page-2' : undefined };
  }
  throw new Erreur('requete', 'Appel non prévu par la démonstration : ' + methode + ' ' + p, 400);
}
