// Calculs sans affichage : relevés bancaires, catégories, abonnements, budget réel, rendement réel, indépendance financière, fiscalité, revenus passifs.
// node tests/calculs.test.js
const C = require('../calculs.js'); const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const AUJ = new Date('2026-10-16T12:00:00'), pres = (a, b, e = 0.01) => Math.abs(a - b) <= e;

/* montants et dates */
ok(C.lireMontant('1 234,56') === 1234.56 && C.lireMontant('-12,30 €') === -12.3 && C.lireMontant('1.234,56') === 1234.56 && C.lireMontant('1,234.56') === 1234.56, 'montants français et anglais');
ok(C.lireMontant('(12.30)') === -12.3 && C.lireMontant('12,30-') === -12.3 && C.lireMontant('+2 450,00') === 2450 && C.lireMontant('abc') === null && C.lireMontant('') === null, 'montants négatifs et invalides');
ok(C.lireDate('05/10/2026') === '2026-10-05' && C.lireDate('05/10/26') === '2026-10-05' && C.lireDate('2026-10-05') === '2026-10-05' && C.lireDate('20261005120000[+1:CET]') === '2026-10-05' && C.lireDate('32/13/2026') === null, 'dates');

/* Crédit Agricole : lignes d'en-tête avant le tableau, colonnes débit et crédit */
const ca = C.lireReleve('Compte de Chèques;N° 0123456\nSolde au 16/10/2026;1 234,00\n\nDate;Libellé;Débit euros;Crédit euros;\n05/10/2026;"PRLV SEPA NETFLIX.COM";13,49;;\n06/10/2026;"CB CARREFOUR MARKET 05/10";54,20;;\n01/10/2026;"VIR SALAIRE ACME SAS";;2 450,00;\n');
ok(ca.format === 'CSV' && ca.ops.length === 3 && ca.erreurs === 0, 'Crédit Agricole : 3 opérations (' + JSON.stringify(ca) + ')');
ok(ca.ops[0].m === -13.49 && ca.ops[2].m === 2450 && ca.ops[1].lib === 'CB CARREFOUR MARKET 05/10', 'Crédit Agricole : débit négatif, crédit positif');
/* BoursoBank : montant signé, colonnes en anglais, commentaire ajouté au libellé */
const bo = C.lireReleve('dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance\n2026-10-03;2026-10-03;"CARTE 02/10/26 UBER EATS";"Restaurants";"Loisirs";"uber eats";-23,90;;0001;BoursoBank;1000\n2026-10-04;2026-10-04;"VIR SEPA LIVRET A";"Épargne";"Épargne";"";-200,00;"mensuel";0001;BoursoBank;800\n');
ok(bo.ops.length === 2 && bo.ops[0].m === -23.9 && bo.ops[0].d === '2026-10-03' && /mensuel/.test(bo.ops[1].lib), 'BoursoBank');
/* Société Générale : libellé et détail, montant de l'opération */
const sg = C.lireReleve("Date de l'opération;Libellé;Détail de l'écriture;Montant de l'opération;Devise\n12/10/2026;PRELEVEMENT EUROPEEN;EDF CLIENTS PARTICULIERS;-1 200,00;EUR\n13/10/2026;CARTE X1234;PHARMACIE DU CENTRE;-18,40;EUR\n");
ok(sg.ops.length === 2 && sg.ops[0].m === -1200 && /EDF/.test(sg.ops[0].lib) && /PHARMACIE/.test(sg.ops[1].lib), 'Société Générale');
/* OFX (format SGML, sans balises fermantes) et QIF */
const ofx = C.lireReleve('OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>\n<STMTTRN>\n<TRNTYPE>DEBIT\n<DTPOSTED>20261008\n<TRNAMT>-9.99\n<FITID>A1\n<NAME>SPOTIFY P2D3\n</STMTTRN>\n<STMTTRN>\n<TRNTYPE>CREDIT\n<DTPOSTED>20261001\n<TRNAMT>2450.00\n<FITID>A2\n<NAME>VIR SALAIRE\n<MEMO>ACME OCTOBRE\n</STMTTRN>\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>');
ok(ofx.format === 'OFX' && ofx.ops.length === 2 && ofx.ops[0].m === -9.99 && ofx.ops[0].fid === 'A1' && /ACME/.test(ofx.ops[1].lib), 'OFX');
const qif = C.lireReleve('!Type:Bank\nD10/09/2026\nT-45.00\nPSNCF CONNECT\n^\nD10/10/2026\nT-45.00\nPSNCF CONNECT\n^\n');
ok(qif.format === 'QIF' && qif.ops.length === 2 && qif.ops[1].d === '2026-10-10', 'QIF');
/* fichier sans entête */
const brut = C.lireReleve('03/10/2026;LECLERC DRIVE;-87,15\n04/10/2026;LOYER OCTOBRE;-750,00\n');
ok(brut.ops.length === 2 && brut.ops[0].m === -87.15 && brut.ops[1].lib === 'LOYER OCTOBRE', 'relevé sans entête');

/* catégories */
const cat = (l, m = -10) => C.categoriser(l, m);
ok(cat('PRLV SEPA NETFLIX.COM') === 'abonnement' && cat('CB CARREFOUR MARKET 05/10') === 'alimentation' && cat('VIR SALAIRE ACME SAS', 2450) === 'revenu', 'catégories : abonnement, courses, salaire');
ok(cat('PRELEVEMENT EUROPEEN EDF CLIENTS PARTICULIERS') === 'energie' && cat('CARTE X1234 PHARMACIE DU CENTRE') === 'sante' && cat('CARTE 02/10/26 UBER EATS') === 'loisirs' && cat('UBER BV 12/10') === 'transport', 'catégories : énergie, santé, Uber Eats ≠ Uber');
ok(cat('VIR SEPA LIVRET A') === 'epargne' && cat('RETRAIT DAB 12/10') === 'retrait' && cat('PRLV DGFIP IMPOT') === 'impots' && cat('ECHEANCE PRET IMMO') === 'credit' && cat('LOYER OCTOBRE') === 'logement', 'catégories : épargne, retrait, impôts, crédit, loyer');
ok(cat('ABONNEMENT L ORANGE BLEUE') === 'abonnement' && cat('FREE MOBILE') === 'telecom' && cat('MAIF ASSURANCE') === 'assurance' && cat('BOUTIQUE INCONNUE') === 'autre' && cat('REMISE CHEQUE', 50) === 'revenu', 'catégories : salle de sport, téléphone, assurance, inconnu');
ok(C.cleLibelle('CB CARREFOUR MARKET 05/10 CARTE 4567') === 'carrefour market' && C.cleLibelle('PRLV SEPA NETFLIX.COM') === 'netflix', 'clé de libellé');
ok(C.categoriser('CB BOUTIQUE INCONNUE 05/10', -10, { 'boutique inconnue': 'loisirs' }) === 'loisirs', 'règle apprise prioritaire');
/* fusion sans doublon */
const deja = C.fusionnerOps([], ca.ops, {}, 'ca.csv'); ok(deja.length === 3 && deja.every(o => o.id && o.cat), 'opérations ajoutées et catégorisées');
ok(C.fusionnerOps(deja, ca.ops, {}).length === 0 && C.fusionnerOps(deja, [{ d: '2026-10-07', lib: 'CB CARREFOUR MARKET 05/10', m: -54.2 }], {}).length === 1, 'doublons écartés, nouvelle opération gardée');

/* budget réel, comparaison, moyennes, abonnements */
const ops = []; const add = (d, lib, m) => ops.push(...C.fusionnerOps(ops, [{ d, lib, m }], {}));
for (const mo of ['06', '07', '08', '09', '10']) {
  add(`2026-${mo}-01`, 'VIR SALAIRE ACME', 2500); add(`2026-${mo}-05`, 'PRLV NETFLIX.COM', -13.49); add(`2026-${mo}-08`, 'PRLV FREE MOBILE', -19.99);
  add(`2026-${mo}-10`, 'CB CARREFOUR', -320); add(`2026-${mo}-12`, 'CB RESTAURANT LE ZINC', mo === '09' ? -260 : -80); add(`2026-${mo}-15`, 'VIR LIVRET A', -300); add(`2026-${mo}-02`, 'LOYER', -750);
}
add('2026-03-20', 'PRLV MAIF AUTO ANNUEL', -480); add('2025-03-21', 'PRLV MAIF AUTO ANNUEL', -470);
const sep = C.reelDuMois(ops, '2026-09');
ok(sep.rev === 2500 && sep.epargne === 300 && pres(sep.dep, 13.49 + 19.99 + 320 + 260 + 750) && sep.cat.loisirs === 260, 'réel de septembre (' + JSON.stringify(sep) + ')');
const cmp = C.comparer({ loisirs: 80, alimentation: 350, logement: 750, abonnement: 15, telecom: 20 }, sep);
ok(cmp.depasse.length === 1 && cmp.depasse[0].cat === 'loisirs' && cmp.depasse[0].ecart === 180, 'dépassement repéré : +180 € en loisirs');
const moy = C.moyennes(ops, 3, AUJ); ok(moy.mois.join() === '2026-07,2026-08,2026-09' && moy.cat.alimentation === 320 && moy.cat.loisirs === 140 && moy.rev === 2500 && !moy.cat.epargne, 'moyennes des 3 derniers mois complets');
const abo = C.abonnements(ops, AUJ), nom = k => abo.find(a => a.cle === k);
ok(nom('netflix') && nom('netflix').freq === 'mensuel' && nom('netflix').parAn === 162 && nom('free mobile') && nom('maif auto annuel') && nom('maif auto annuel').freq === 'annuel', 'abonnements mensuels et annuel détectés (' + abo.map(a => a.cle + ':' + a.freq).join(', ') + ')');
ok(!nom('vir livret') && !abo.some(a => a.cat === 'revenu'), 'épargne et salaire ne sont pas des abonnements');

/* rendement réel */
const r1 = C.tri([{ d: '2025-10-16', m: 1000 }], 1100, AUJ); ok(pres(r1.tri, 0.1, 0.002) && r1.gain === 100, 'TRI d’un versement unique : 10 % (' + r1.tri + ')');
const r2 = C.tri([{ d: '2024-10-16', m: 1000 }, { d: '2025-10-16', m: 1000 }], 2300, AUJ); ok(r2.tri > 0.09 && r2.tri < 0.11 && r2.verse === 2000, 'TRI de deux versements (' + r2.tri + ')');
const r3 = C.tri([{ d: '2024-10-16', m: 1000 }, { d: '2025-10-16', m: -300 }], 600, AUJ); ok(r3.tri < 0 && r3.gain === -100, 'TRI négatif avec un retrait');
ok(C.tri([{ d: '2026-10-10', m: 1000 }], 1010, AUJ).tri === null, 'pas de taux annualisé sur moins d’un mois');
ok(pres(C.aTauxFixe([{ d: '2025-10-16', m: 1000 }], 1.7, AUJ), 1017, 0.1), 'même versement au Livret A');
const cours = [[+new Date('2024-10-01'), 100], [+new Date('2025-10-01'), 110], [+new Date('2026-10-01'), 121]];
ok(pres(C.dansIndice([{ d: '2024-10-16', m: 1000 }, { d: '2025-10-16', m: 1000 }], cours), 2310, 0.5) && C.dansIndice([{ d: '2010-01-01', m: 1 }], cours) === null, 'mêmes versements dans un indice');
const fr = C.coutFrais(10000, 1, 20, 5); ok(fr.parAn === 100 && fr.total > 4000 && fr.total < 5000, 'coût des frais sur 20 ans (' + fr.total + ')');

/* indépendance financière */
const fi = C.independance({ age: 35, capital: 50000, epargne: 800, depenses: 2500, pension: 1000, ageCible: 60, retrait: 4 });
ok(fi.cible === 450000 && fi.besoin === 18000, 'capital visé : 1 500 € par mois × 12 ÷ 4 %');
ok(fi.scenarios.favorable.age <= fi.scenarios.moyen.age && fi.scenarios.moyen.age <= fi.scenarios.prudent.age, 'scénarios ordonnés (' + Object.values(fi.scenarios).map(s => s.age).join(', ') + ')');
ok(fi.probaAtteinte > 0 && fi.probaAtteinte < 1 && fi.probaDuree >= 0 && fi.probaDuree <= 1 && fi.bandes.p50.length === fi.horizon - 35 + 1, 'probabilités et bandes');
ok(fi.bandes.p10[10].v <= fi.bandes.p50[10].v && fi.bandes.p50[10].v <= fi.bandes.p90[10].v, 'bandes 10/50/90 ordonnées');
ok(C.independance({ age: 40, capital: 5e6, epargne: 0, depenses: 3000, ageCible: 45 }).probaAtteinte === 1, 'déjà indépendant');
ok(JSON.stringify(C.independance({ age: 30, capital: 1e4, epargne: 500, depenses: 2000 }).probaAtteinte) === JSON.stringify(C.independance({ age: 30, capital: 1e4, epargne: 500, depenses: 2000 }).probaAtteinte), 'résultat reproductible');

/* fiscalité */
const cto = C.impotVente({ type: 'cto', valeur: 15000, verse: 10000 }); ok(cto.gain === 5000 && cto.impot === 640 && cto.ps === 930 && cto.total === 1570, 'compte-titres : PFU 31,4 %');
const peaV = C.impotVente({ type: 'pea', valeur: 15000, verse: 10000, ans: 6 }); ok(peaV.impot === 0 && peaV.ps === 930, 'PEA de plus de 5 ans : prélèvements sociaux seuls');
const av = C.impotVente({ type: 'av', valeur: 70000, verse: 50000, vente: 14000, ans: 10 }); ok(av.gain === 4000 && av.impot === 0 && av.ps === 688, 'assurance-vie de plus de 8 ans sous l’abattement');
const av2 = C.impotVente({ type: 'av', valeur: 70000, verse: 50000, ans: 10, couple: true }); ok(av2.impot === Math.round((20000 - 9200) * 0.075), 'assurance-vie, couple : abattement de 9 200 € puis 7,5 %');
ok(C.impotVente({ type: 'livret', valeur: 23000, verse: 20000 }).total === 0 && C.impotVente({ type: 'cto', valeur: 8000, verse: 10000 }).total === 0, 'livret exonéré, moins-value sans impôt');
const ab = C.abattementsImmo(22), ab30 = C.abattementsImmo(30); ok(ab.ir === 100 && pres(ab.ps, 28) && ab30.ps === 100 && C.abattementsImmo(5).ir === 0, 'abattements de la plus-value immobilière');
ok(C.surtaxeImmo(55000) === 850 && C.surtaxeImmo(40000) === 0 && C.surtaxeImmo(300000) === 18000, 'surtaxe des plus-values immobilières');
const bien = C.impotVente({ type: 'bien', valeur: 300000, verse: 200000, ans: 10 }); ok(bien.impot === Math.round(100000 * 0.7 * 0.19 + C.surtaxeImmo(70000)) && bien.ps === Math.round(100000 * (1 - 0.0825) * 0.172), 'plus-value immobilière après 10 ans');
ok(C.impotVente({ type: 'bien', valeur: 300000, verse: 200000, ans: 3, rp: true }).total === 0, 'résidence principale exonérée');
ok(C.droits(150000, 'enfant') === 28194 && C.droits(50000, 'frere') === Math.round(24430 * 0.35 + (50000 - 24430) * 0.45), 'barèmes des droits');
const su = C.succession({ patrimoine: 500000, enfants: 2 }); ok(su.droitsParEnfant === 28194 && su.total === 56388, 'succession : 2 enfants, 500 000 €');
const su2 = C.succession({ patrimoine: 500000, enfants: 2, conjoint: true, av: 400000 }); ok(su2.conjoint === 125000 && su2.droitsAV === Math.round((200000 - 152500) * 0.2), 'succession avec conjoint et assurance-vie');
ok(C.donation(100000, 'enfant').droits === 0 && C.donation(150000, 'enfant', 0, true).droits === C.droits(150000 - 131865, 'enfant'), 'donation : abattement et don familial');
ok(C.ifi(1200000) === 0 && C.ifi(1500000) === 3900 && C.ifi(1350000) === 2225, 'IFI avec décote');

/* revenus passifs */
const dv = C.dividendesAVenir([{ date: +new Date('2026-03-15') / 1000, amount: 0.5 }, { date: +new Date('2025-11-20') / 1000, amount: 0.4 }, { date: +new Date('2024-03-15') / 1000, amount: 9 }], 100, AUJ);
ok(dv[5] === 50 && dv[1] === 40 && dv.reduce((a, b) => a + b, 0) === 90, 'dividendes des 12 prochains mois');
const rp = C.revenusPassifs([{ type: 'loyer', mois: Array(12).fill(700) }, { type: 'dividendes', mois: dv }]); ok(rp.total === 8490 && rp.mois[5].par.dividendes === 50 && rp.mois[1].total === 740, 'revenus passifs par mois et par type');

/* rappels de paiement : Bricks le 8, BienPrêter le 5 */
ok(C.echeance('2026-10', 8) === '2026-10-08' && C.echeance('2026-02', 31) === '2026-02-28' && C.echeance('2028-02', 30) === '2028-02-29', 'date du paiement dans le mois (fin de mois si besoin)');
const bricks = { id: 'r1', nom: 'Bricks', jour: 8, cree: '2026-09-01', hist: {} }, bp = { id: 'r2', nom: 'BienPrêter', jour: 5, cree: '2026-10-01', hist: {}, motif: 'bienpreter|lemonway', attendu: 42.5 };
ok(C.rappelsDus([bricks, bp], '2026-10-04').length === 1 && C.rappelsDus([bricks, bp], '2026-10-04')[0].mois === '2026-09', 'avant le jour J : seul le mois précédent non validé est dû');
const du = C.rappelsDus([bricks, bp], '2026-10-08');
ok(du.length === 3 && du[2].r === bricks && du[2].statut === 'a_valider' && du[1].r === bp && du[1].statut === 'a_valider' && du[0].statut === 'retard', 'le jour J : à valider ; septembre non validé : en retard');
ok(C.rappelsDus([bp], '2026-10-08')[0].statut === 'a_valider' && C.rappelsDus([bp], '2026-10-09')[0].statut === 'retard' && C.rappelsDus([bp], '2026-10-09')[0].jours === 4, 'en retard après 3 jours sans validation');
bricks.hist['2026-09'] = { s: 'recu', m: 31.2 }; bricks.hist['2026-10'] = { s: 'absent' };
ok(C.rappelsDus([bricks], '2026-10-20').length === 0 && C.prochaineEcheance(bricks, '2026-10-20') === '2026-11-08' && C.prochaineEcheance(bp, '2026-10-05') === '2026-10-05', 'validé ou absent : plus dû ; prochaine échéance');
ok(C.rappelsDus([Object.assign({}, bp, { actif: false })], '2026-12-01').length === 0 && C.rappelsDus([Object.assign({}, bp, { cree: '2026-10-06' })], '2026-10-20').length === 0, 'rappel désactivé ou créé après la date : rien de dû');
const opsB = [{ id: 'x1', d: '2026-10-06', lib: 'VIR SEPA LEMONWAY BIENPRETER', m: 42.5 }, { id: 'x2', d: '2026-10-05', lib: 'VIR BIENPRETER', m: 10 }, { id: 'x3', d: '2026-10-05', lib: 'CARTE BIENPRETER', m: -42.5 }, { id: 'x4', d: '2026-09-20', lib: 'VIR BIENPRETER', m: 42.5 }, { id: 'x5', d: '2026-10-09', lib: 'VIR SALAIRE', m: 42.5 }];
ok(C.rapprocher(bp, '2026-10', opsB).id === 'x1', 'rapprochement : bon libellé, bon montant, dans la fenêtre');
ok(C.rapprocher(bp, '2026-10', opsB, new Set(['x1'])).id === 'x2' && C.rapprocher(bp, '2026-10', opsB, new Set(['x1', 'x2'])) === null, 'opération déjà utilisée écartée');
ok(C.rapprocher({ nom: 'Bricks', jour: 8 }, '2026-10', [{ id: 'b', d: '2026-10-09', lib: 'Vir. Bricks.co loyers', m: 12.3 }]).id === 'b', 'rapprochement par le nom de la plateforme');
const ob = C.opsBanque([{ id: 't1', d: '2026-10-02', lib: 'CB CARREFOUR', m: -54.2, dev: 'EUR' }, { id: 't2', d: '2026-10-03', lib: 'EN ATTENTE', m: -5, etat: 'PDNG' }, { id: 't3', d: '2026-10-04', lib: 'USD', m: -5, dev: 'USD' }, { id: 't4', d: '2026-10-05', lib: 'NETFLIX', m: -13.49 }], 'abc', [{ d: '2026-10-05', m: -13.49, lib: 'PRLV NETFLIX.COM' }]);
ok(ob.length === 1 && ob[0].fid === 'eb:abc:t1' && ob[0].m === -54.2, 'opérations de la banque : en attente, devise et doublon d’un relevé écartés');
ok(C.fusionnerOps(ob, C.opsBanque([{ id: 't1', d: '2026-10-02', lib: 'CB CARREFOUR MARKET', m: -54.2 }], 'abc')).length === 0, 'opération de la banque déjà reçue non reprise');

console.log('calculs :', n, 'contrôles réussis');
