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
ok(du.length === 3 && du[2].r === bricks && du[2].statut === 'a_valider' && du[1].r === bp && du[1].statut === 'a_valider' && du[0].statut === 'alerte', 'le jour J : à valider ; septembre non validé depuis un mois : en alerte');
ok(C.rappelsDus([bp], '2026-10-08')[0].statut === 'a_valider' && C.rappelsDus([bp], '2026-10-09')[0].statut === 'retard' && C.rappelsDus([bp], '2026-10-09')[0].jours === 4, 'en retard après 3 jours sans validation');
bricks.hist['2026-09'] = { s: 'recu', m: 31.2 }; bricks.hist['2026-10'] = { s: 'absent' };
ok(C.rappelsDus([bricks], '2026-10-20').length === 0 && C.prochaineEcheance(bricks, '2026-10-20') === '2026-11-09' && C.prochaineEcheance(bp, '2026-10-05') === '2026-10-05', 'validé ou absent : plus dû ; prochaine échéance');
ok(C.rappelsDus([Object.assign({}, bp, { actif: false })], '2026-12-01').length === 0 && C.rappelsDus([Object.assign({}, bp, { cree: '2026-10-06' })], '2026-10-20').length === 0, 'rappel désactivé ou créé après la date : rien de dû');
const opsB = [{ id: 'x1', d: '2026-10-06', lib: 'VIR SEPA LEMONWAY BIENPRETER', m: 42.5 }, { id: 'x2', d: '2026-10-05', lib: 'VIR BIENPRETER', m: 10 }, { id: 'x3', d: '2026-10-05', lib: 'CARTE BIENPRETER', m: -42.5 }, { id: 'x4', d: '2026-09-20', lib: 'VIR BIENPRETER', m: 42.5 }, { id: 'x5', d: '2026-10-09', lib: 'VIR SALAIRE', m: 42.5 }];
ok(C.rapprocher(bp, '2026-10', opsB).id === 'x1', 'rapprochement : bon libellé, bon montant, dans la fenêtre');
ok(C.rapprocher(bp, '2026-10', opsB, new Set(['x1'])).id === 'x2' && C.rapprocher(bp, '2026-10', opsB, new Set(['x1', 'x2'])) === null, 'opération déjà utilisée écartée');
ok(C.rapprocher({ nom: 'Bricks', jour: 8 }, '2026-10', [{ id: 'b', d: '2026-10-09', lib: 'Vir. Bricks.co loyers', m: 12.3 }]).id === 'b', 'rapprochement par le nom de la plateforme');
const ob = C.opsBanque([{ id: 't1', d: '2026-10-02', lib: 'CB CARREFOUR', m: -54.2, dev: 'EUR' }, { id: 't2', d: '2026-10-03', lib: 'EN ATTENTE', m: -5, etat: 'PDNG' }, { id: 't3', d: '2026-10-04', lib: 'USD', m: -5, dev: 'USD' }, { id: 't4', d: '2026-10-05', lib: 'NETFLIX', m: -13.49 }], 'abc', [{ d: '2026-10-05', m: -13.49, lib: 'PRLV NETFLIX.COM' }]);
ok(ob.length === 1 && ob[0].fid === 'eb:abc:t1' && ob[0].m === -54.2, 'opérations de la banque : en attente, devise et doublon d’un relevé écartés');
ok(C.fusionnerOps(ob, C.opsBanque([{ id: 't1', d: '2026-10-02', lib: 'CB CARREFOUR MARKET', m: -54.2 }], 'abc')).length === 0, 'opération de la banque déjà reçue non reprise');

/* jours ouvrés : week-end et jours fériés décalés au jour ouvré suivant */
ok(C.echeanceR({ jour: 8 }, '2026-11') === '2026-11-09' && C.echeanceR({ jour: 8, ouvre: false }, '2026-11') === '2026-11-08' && C.echeanceR({ jour: 5 }, '2026-10') === '2026-10-05', 'un dimanche devient lundi, sauf si on demande de ne pas décaler');
ok(C.ferie('2026-04-06') && C.ferie('2026-05-14') && C.ferie('2026-05-25') && C.ferie('2026-11-11') && !C.ferie('2026-04-07') && C.ferie('2027-03-29'), 'jours fériés : lundi de Pâques, Ascension, Pentecôte, 11 novembre');
ok(C.echeanceR({ jour: 11 }, '2026-11') === '2026-11-12' && C.echeanceR({ jour: 1 }, '2026-05') === '2026-05-04', '11 novembre férié → 12 ; 1er mai (vendredi férié) → lundi 4');
ok(C.rappelsDus([{ id: 'w', nom: 'X', jour: 8, cree: '2026-10-01', hist: {} }], '2026-11-08').length === 1 && C.rappelsDus([{ id: 'w', nom: 'X', jour: 8, cree: '2026-11-01', hist: {} }], '2026-11-08').length === 0 && C.rappelsDus([{ id: 'w', nom: 'X', jour: 8, cree: '2026-11-01', hist: {} }], '2026-11-09').length === 1, 'rien d’exigé le dimanche : le paiement est attendu lundi');
/* montant habituel */
ok(C.montantHabituel({ attendu: 40 }) === 40 && C.montantHabituel({ hist: { '2026-07': { s: 'recu', m: 10 }, '2026-08': { s: 'recu', m: 30 }, '2026-09': { s: 'recu', m: 12 }, '2026-10': { s: 'absent' }, '2026-05': { s: 'recu', m: 999 } } }) === 12 && C.montantHabituel({}) === 0, 'montant habituel : saisi, sinon médiane des trois derniers paiements');
/* retraits vers la banque */
const pf = { nom: 'Bricks', jour: 8, ret: [{ tx: 'r2' }] }, cr = [{ id: 'r1', d: '2026-10-12', lib: 'VIR SEPA BRICKS RETRAIT', m: 50 }, { id: 'r2', d: '2026-10-13', lib: 'VIR BRICKS', m: 20 }, { id: 'r3', d: '2026-10-14', lib: 'VIR SALAIRE', m: 500 }, { id: 'r4', d: '2026-09-01', lib: 'VIR BRICKS ANCIEN', m: 9 }, { id: 'r5', d: '2026-10-15', lib: 'CB BRICKS', m: -5 }, { id: 'r6', d: '2026-10-16', lib: 'VIR BRICKS', m: 300 }];
const rt = C.retraitsPossibles(pf, cr, new Set(), 80, '2026-10-01');
ok(rt.length === 2 && rt[0].op.id === 'r1' && rt[0].somme === 50 && rt[1].op.id === 'r6' && rt[1].somme === 80, 'retraits : libellé de la plateforme, après la création, jamais traités, plafonnés au portefeuille');
ok(C.retraitsPossibles(pf, cr, new Set(['r1', 'r6']), 80, '2026-10-01').length === 0 && C.retraitsPossibles(pf, cr, new Set(), 0, '2026-10-01').length === 0, 'retrait déjà utilisé ou portefeuille vide : rien');
/* doublons entre sources (une seule fois chacune, 2 jours de tolérance) */
const dd = C.ecarterDoublons([{ d: '2026-10-05', m: -2.5 }, { d: '2026-10-05', m: -2.5 }, { d: '2026-10-07', m: -13.49 }, { d: '2026-10-20', m: -9 }], [{ d: '2026-10-06', m: -2.5 }, { d: '2026-10-05', m: -13.49 }]);
ok(dd.length === 2 && dd.filter(x => x.m === -2.5).length === 1 && dd.some(x => x.m === -9) && !dd.some(x => x.m === -13.49), 'doublons : un seul achat identique est écarté, pas les deux ; 2 jours d’écart tolérés (' + JSON.stringify(dd) + ')');
ok(C.opsBanque([{ id: 'a', d: '2026-10-07', lib: 'NETFLIX', m: -13.49 }], 'x', [{ d: '2026-10-05', m: -13.49, lib: 'PRLV NETFLIX.COM' }]).length === 0 && C.opsBanque([{ id: 'a', d: '2026-10-09', lib: 'NETFLIX', m: -13.49 }], 'x', [{ d: '2026-10-05', m: -13.49, lib: 'PRLV NETFLIX.COM' }]).length === 1, 'banque contre relevé CSV : doublon reconnu à 2 jours près, pas à 4');
ok(C.pourEpargne({ lib: 'VIR DE M DUPONT', m: 200 }).cat === 'virement' && C.pourEpargne({ lib: 'INTERETS CREDITEURS', m: 3.2 }).cat === 'revenu' && C.pourEpargne({ lib: 'RETRAIT', m: -100 }).cat === 'virement', 'compte d’épargne : virements neutres, intérêts en revenu');
/* calendrier */
const ic = C.ics([{ id: 'r1', nom: 'Bricks', jour: 8, attendu: 31.2 }, { id: 'r2', nom: 'Fin; de mois', jour: 31 }, { id: 'r3', nom: 'Off', jour: 3, actif: false }], '2026-10-16');
ok(/^BEGIN:VCALENDAR\r\n/.test(ic) && /END:VCALENDAR\r\n$/.test(ic) && (ic.match(/BEGIN:VEVENT/g) || []).length === 2 && /DTSTART;VALUE=DATE:20261108\r\n/.test(ic) && /RRULE:FREQ=MONTHLY;BYMONTHDAY=8\r\n/.test(ic) && /BYMONTHDAY=-1/.test(ic) && /environ 31\\,2 €/.test(ic) && /Fin\\; de mois/.test(ic) && /TRIGGER:PT9H/.test(ic) && !/Off/.test(ic), 'calendrier : un événement mensuel par rappel actif, échappements, dernier jour du mois');
ok(/DTSTART;VALUE=DATE:20261105/.test(C.icsUnique('x', 'Renouveler', 'Banque', '2026-11-05', '2026-10-16')) && /SUMMARY:Renouveler/.test(C.icsUnique('x', 'Renouveler', 'Banque', '2026-11-05', '2026-10-16')), 'calendrier : événement unique');

/* ticker à suivre : ISIN lu dans le texte, places européennes d'abord, ni indice ni change */
ok(C.isinDe('S&P 500 EUR (Acc)', 'isin : fr0011550185') === 'FR0011550185' && C.isinDe('Air Liquide') === '', 'ISIN lu dans le nom ou les notes');
ok(C.choisirTicker([{ symbol: '^SPX', type: 'INDEX' }, { symbol: 'ESE.MI', type: 'ETF' }, { symbol: 'ESE.PA', type: 'ETF' }]) === 'ESE.PA', 'ticker : Paris avant Milan, indice écarté');
ok(C.choisirTicker([{ symbol: 'EURUSD=X' }, { symbol: 'MSFT', type: 'EQUITY' }]) === 'MSFT' && C.choisirTicker([]) === '', 'ticker : change écarté, liste vide');

/* pourquoi le patrimoine a bougé : versements, marché, crédits */
const H = [{ d: '2026-08-31', v: 50000, i: 40000, k: 100000, g: { bourse: 2000, crowd: 0 } }, { d: '2026-09-15', v: 51000, i: 40500 },
  { d: '2026-09-30', v: 52300, i: 41000, k: 99400, g: { bourse: 2900, crowd: 0 } }, { d: '2026-10-05', v: 52000, i: 41000 }];
const va = C.variation(H, '2026-09-01', '2026-09-30');
ok(va && va.ecart === 2300 && va.verse === 1000 && va.credit === 600 && va.marche === 700 && va.de === '2026-08-31' && va.a === '2026-09-30', 'variation : versements, crédits, marché (' + JSON.stringify(va) + ')');
ok(va.parCat.length === 1 && va.parCat[0].cat === 'bourse' && va.parCat[0].m === 900 && va.principal === 'verse', 'variation : par catégorie et cause principale');
const vb = C.variation([{ d: '2026-09-02', v: 100, i: 100 }, { d: '2026-09-20', v: 80, i: 100 }], '2026-09-01', '2026-09-30');
ok(vb && vb.ecart === -20 && vb.marche === -20 && vb.sansCredit && vb.principal === 'marche', 'variation : premier point dans la période, sans crédit');
ok(C.variation([{ d: '2026-09-02', v: 1, i: 1 }], '2026-09-01', '2026-09-30') === null && C.variation([], '2026-09-01', '2026-09-30') === null, 'variation : un seul point, rien à expliquer');

/* aide à la déclaration */
ok(C.interetsRecus([{ d: '2025-03-05', m: 30, c: 20 }, { d: '2025-04-05', m: 12 }, { d: '2026-01-05', m: 50 }], 2025) === 22, 'intérêts reçus dans l’année, capital déduit');
ok(C.dividendesAnnee([{ date: Date.parse('2025-06-10') / 1000, amount: 1.5 }, { date: Date.parse('2026-06-10') / 1000, amount: 2 }], 10, 2025) === 15, 'dividendes de l’année');
const vt = C.ventesAnnee([{ d: '2025-02-01', pv: 300 }, { d: '2025-05-01', pv: -120 }, { d: '2024-05-01', pv: 999 }], 2025);
ok(vt.n === 2 && vt.gains === 300 && vt.pertes === 120 && vt.net === 180, 'ventes de l’année');
ok(C.etrangere('Trade Republic', '') === 'trade republic' && C.etrangere('ETF', 'acheté sur DEGIRO') === 'degiro' && C.etrangere('Bienprêter') === '' && C.etrangere('Wiseman SA') === '', 'plateformes établies à l’étranger');
const dc = C.declaration({ annee: 2025, interets: [{ nom: 'BienPrêter', m: 120 }, { nom: 'Projet', m: 80, estime: true }], dividendes: [{ nom: 'TTE', m: 45 }], ventes: vt, loyers: [{ nom: 'Studio', m: 7200 }],
  etrangers: ['Trade Republic'], exoneres: ['Livret A'], crypto: 1, pertesProjets: ['Résidence X'] });
const lg = k => dc.lignes.find(x => x.cle === k);
ok(lg('interets').montant === 200 && lg('interets').estime && /2TR/.test(lg('interets').cases) && lg('dividendes').cases === '2DC' && lg('ventes').cases === '3VG' && lg('loyers').cases === '4BE', 'déclaration : lignes et cases habituelles');
ok(dc.rappels.length === 4 && dc.rappels.some(r => /3916/.test(r)) && dc.rappels.some(r => /2086/.test(r)) && /180|300/.test(lg('ventes').note), 'déclaration : rappels (étranger, cryptoactifs, défauts, exonérés)');
ok(C.declaration({ annee: 2025, loyers: [{ m: 16000 }] }).lignes[0].cases === '2044' && C.declaration({ annee: 2025, ventes: { n: 1, gains: 0, pertes: 50, net: -50 } }).lignes[0].cases === '3VH' && !C.declaration({ annee: 2025 }).lignes.length, 'déclaration : régime réel, moins-value, rien à déclarer');

/* frais */
const fp = C.fraisPlacements([{ id: 'a', nom: 'Assurance-vie', valeur: 20000, frais: 2 }, { id: 'b', nom: 'ETF', valeur: 10000, frais: 0.2 }, { id: 'c', nom: 'Sans frais', valeur: 5000 }]);
ok(fp.lignes.length === 2 && fp.lignes[0].id === 'a' && fp.parAn === 420 && fp.lignes[1].economie20 === 0 && fp.lignes[0].economie20 > 10000 && fp.economie20 === fp.lignes[0].economie20, 'frais des placements comparés à un ETF Monde (' + JSON.stringify(fp.lignes[0]) + ')');
const fb = C.fraisBancaires([{ d: '2026-09-10', lib: 'COTISATION CARTE VISA PREMIER', m: -134, cat: 'autre' }, { d: '2026-08-02', lib: 'FRAIS COMMISSION D INTERVENTION', m: -8, cat: 'autre' }, { d: '2026-07-02', lib: 'FRAIS COMMISSION D INTERVENTION', m: -8, cat: 'autre' },
  { d: '2026-09-12', lib: 'CB GRAND FRAIS 11/09', m: -42, cat: 'alimentation' }, { d: '2026-09-13', lib: 'CB GRAND FRAIS LYON', m: -42, cat: 'autre' }, { d: '2025-01-02', lib: 'AGIOS', m: -30, cat: 'autre' }, { d: '2026-09-01', lib: 'COTISATION MUTUELLE', m: -60, cat: 'autre' }], AUJ);
ok(fb.total === 150 && fb.lignes.length === 2 && fb.lignes[0].total === 134 && fb.lignes[1].n === 2, 'frais bancaires des 12 derniers mois (' + JSON.stringify(fb) + ')');

/* rappels : alerte à J+10, annulation, fusion entre appareils (6.8) */
{
  const r = { id: 'r1', nom: 'BienPrêter', jour: 5, cree: '2026-01-01', hist: {} };
  const st = a => C.rappelsDus([r], a).filter(x => x.mois === '2026-10').map(x => x.statut)[0];
  ok(st('2026-10-05') === 'a_valider' && st('2026-10-09') === 'retard' && st('2026-10-15') === 'retard' && st('2026-10-16') === 'alerte', 'rappel : à confirmer, en retard à J+3, en alerte à J+10');
  r.hist['2026-10'] = { s: 'annule', t: 2 };
  ok(st('2026-10-20') === 'alerte' && C.prochaineEcheance(r, '2026-10-01') === '2026-10-05', 'une validation annulée rouvre le rappel');
  r.hist['2026-10'] = { s: 'recu', m: 50, t: 3 };
  ok(st('2026-10-20') === undefined && C.historique(r)[0].mois === '2026-10', 'validation : rappel fermé, historique lisible');
  const L = [{ id: 'a', nom: 'A', jour: 5, u: 10, hist: { '2026-09': { s: 'recu', m: 10, t: 5 } } }, { id: 'b', nom: 'B', jour: 8, u: 10, hist: {} }, { id: 'loc', nom: 'Nouveau', jour: 1, u: 30, hist: {} }];
  const R = [{ id: 'a', nom: 'A (renommé)', jour: 5, u: 20, hist: { '2026-09': { s: 'annule', t: 9 }, '2026-10': { s: 'recu', m: 11, t: 8 } } }, { id: 'b', nom: 'B', jour: 8, u: 5, hist: {} }, { id: 'dist', nom: 'Distant', jour: 2, u: 1, hist: {} }];
  const F = C.fusionRappels(L, R, { b: 15 }, true), fa = F.find(x => x.id === 'a');
  ok(fa.nom === 'A (renommé)' && fa.hist['2026-09'].s === 'annule' && fa.hist['2026-10'].m === 11, 'fusion des rappels : réglages les plus récents, historique mois par mois');
  ok(!F.find(x => x.id === 'b') && F.find(x => x.id === 'loc') && F.find(x => x.id === 'dist') && F.length === 3, 'fusion des rappels : suppression respectée, ajouts des deux côtés gardés');
  ok(C.fusionHist({ m: { s: 'recu', m: 1 } }, { m: { s: 'absent', t: 1 } }).m.s === 'absent' && C.fusionHist({ m: { s: 'recu', t: 9 } }, { m: { s: 'absent', t: 1 } }).m.s === 'recu', 'fusion d’historique : l’entrée datée la plus récente gagne');
}
/* échéancier : prêt amortissable (BienPrêter), in fine, loyers (Bricks) */
{
  const E = C.echeancier({ montant: 1000, taux: 7, duree: 12, debut: '2025-10-15', jour: 5, mode: 'amort', paie: [{ d: '2025-11-05', m: 86.53, c: 80.7 }] }, '2026-04-20');
  ok(E && E.lignes.length === 12 && Math.abs(E.mensualite - 86.53) < 0.01 && E.lignes[0].mois === '2025-11' && E.lignes[0].date === '2025-11-05' && E.lignes[11].crd === 0, 'échéancier amortissable : 12 mensualités de 86,53 €, capital soldé à la fin');
  ok(Math.abs(E.lignes[0].interets - 5.83) < 0.01 && Math.abs(E.lignes[0].capital - 80.7) < 0.02 && E.lignes[0].recu === 86.53 && E.lignes[1].recu === null, 'échéancier : intérêts, capital et montant reçu par mois');
  ok(E.capitalRestantPrevu === E.lignes.find(x => x.mois === '2026-04').crd && E.capitalRestantReel === 919.3 && E.prochaines[0].mois === '2026-04', 'capital restant prévu et réel');
  ok(C.partCapital(C.ligneDuMois(E, '2025-11'), 86.53) === 80.69 && C.partCapital(C.ligneDuMois(E, '2025-11'), 50) === 44.17 && C.partCapital(null, 50) === 0, 'part de capital d’un versement');
  const I = C.echeancier({ montant: 1000, taux: 12, duree: 3, debut: '2026-01-10', mode: 'infine' }, '2026-02-01');
  ok(I.lignes.map(x => x.total).join() === '10,10,1010' && I.capitalRestantPrevu === 1000, 'échéancier in fine : intérêts chaque mois, capital à la fin');
  const B = C.echeancier({ montant: 1200, taux: 6, debut: '2026-01-10', mode: 'loyer' }, '2026-03-01', 12);
  ok(B.lignes.every(x => x.total === 6 && x.capital === 0) && B.prochaines.length === 12 && B.capitalRestantPrevu === 1200, 'échéancier de loyers (Bricks) : revenu mensuel, capital inchangé');
  ok(C.echeancier({ montant: 0, taux: 5, duree: 12, debut: '2026-01-01' }) === null && C.echeancier({ montant: 100, taux: 5, debut: '2026-01-01', mode: 'amort' }) === null, 'échéancier : données incomplètes → rien');
}
/* rapprochement par montant quand le libellé est inattendu */
ok(C.rapprocher({ nom: 'Bricks', jour: 8, attendu: 42.1 }, '2026-10', [{ id: 'z', d: '2026-10-09', lib: 'VIR SEPA LEMON WAY', m: 42.1 }]).parMontant === true
  && C.rapprocher({ nom: 'Bricks', jour: 8, attendu: 42.1 }, '2026-10', [{ id: 'z', d: '2026-10-09', lib: 'VIR SEPA LEMON WAY', m: 60 }]) === null
  && C.rapprocher({ nom: 'Bricks', jour: 8, prevu: 30 }, '2026-10', [{ id: 'y', d: '2026-10-08', lib: 'VIREMENT', m: 30 }]).id === 'y', 'rapprochement par montant presque identique (libellé inattendu)');

/* revenus passifs : fiscalité réglable, réel contre prévu, brut et net, rendements par plateforme */
{
  ok(C.fiscalite({}).ir === 12.8 && C.fiscalite({ ps: '17,2' }).ps === 17.2 && C.fiscalite({ ps: 150, ir: '' }).ps === 18.6 && C.fiscalite({ ir: 0 }).ir === 0, 'fiscalité : valeurs par défaut, saisies, valeurs aberrantes ignorées');
  ok(C.tauxImpot('crowd', {}) === 31.4 && C.tauxImpot('livret', {}, { exonere: true }) === 0 && C.tauxImpot('div', {}, { pea: true }) === 0 && C.tauxImpot('av', {}) === 17.2 && C.tauxImpot('loyer', { tmi: 30, psImmo: 17.2, abatFoncier: 30 }) === 33.04 && C.tauxImpot('loyer', {}) === 33.04 && C.tauxImpot('crowd', { ir: 12.8, ps: 17.2 }) === 30, 'taux d’imposition par source');
  const ML = C.listeMois('2026-11', 3);
  ok(ML.join() === '2026-11,2026-12,2027-01', 'liste de mois');
  const T = C.tableauRevenus([{ type: 'crowd', taux: 30, reel: { '2026-11': 100 }, prevu: { '2026-11': 90, '2026-12': 90 } }, { type: 'livret', taux: 0, reel: null, prevu: { '2026-12': 50 } }], ML);
  ok(T.total.reel === 100 && T.total.prevu === 230 && T.total.reelNet === 70 && T.total.prevuNet === 176 && T.mois[1].prevu === 140 && T.mois[2].prevu === 0 && T.total.par.crowd.prevuNet === 126 && T.total.par.livret.reel === 0 && T.total.suivi === 180 && T.total.estime === 50 && T.mois[1].estime === 50, 'tableau des revenus : réel, prévu, brut et net, par source');
  const Rd = C.rendements([{ nom: 'BienPrêter', flux: [{ d: '2025-01-01', m: 1000 }, { d: '2025-07-01', m: -40 }], valeur: 1000, taux: 31.4 }, { nom: 'Vide', flux: [], valeur: 0 }], new Date('2026-01-01T12:00:00'));
  ok(Rd.lignes.length === 1 && Rd.lignes[0].tri > 0.03 && Rd.lignes[0].tri < 0.05 && Math.abs(Rd.lignes[0].triNet - Rd.lignes[0].tri * 0.686) < 1e-9 && Rd.global && Math.abs(Rd.global.tri - Rd.lignes[0].tri) < 1e-9, 'rendement annualisé brut et net par plateforme et global');
}

/* vue fiscale annuelle : brut reconstitué, PFU ou barème, imputation des pertes, lignes à reporter avec leur case */
{
  global.window = global.window || {}; require('../fiscal-config.js'); const CFG = global.window.FISCAL_CONFIG;
  ok(CFG && CFG.cases.interets.case === '2TR' && /notice officielle/.test(CFG.avertissement) && CFG.regles.pertesPretsParticipatifs.certitude === 'a_verifier', 'fichier de configuration fiscale : cases, règles et avertissement');
  const b = C.brutDe(68.6, true, {}); ok(b.brut === 100 && b.ir === 12.8 && b.ps === 18.6 && C.brutDe(50, false, {}).brut === 50 && C.brutDe(50, false, {}).ir === 0, 'intérêts nets des prélèvements : brut reconstitué');
  const cp = C.comparerPfuBareme({ interets: 1000, dividendes: 1000 }, { tmi: 11 }, CFG.regles);
  ok(cp.pfu.impot === 256 && cp.ps === 372 && cp.meilleur === 'bareme' && Math.abs(cp.bareme.impot - (1600 * 0.11 - 2000 * 0.068 * 0.11)) < 0.01, 'PFU ou barème : abattement de 40 % des dividendes, CSG déductible');
  ok(C.comparerPfuBareme({ interets: 1000 }, { tmi: 41 }, CFG.regles).meilleur === 'pfu', 'tranche élevée : PFU plus avantageux');
  const ip = C.imputationPertes({ 2024: 10000, 2025: 500 }, { 2024: 3000, 2025: 9000 }, 2025, { plafondAnnuel: 8000, reportAns: 5 });
  ok(ip.perteAnnee === 500 && ip.disponible === 7500 && ip.impute === 7500 && ip.reste === 0, 'imputation des pertes : reports des années précédentes, limite annuelle');
  const ip2 = C.imputationPertes({ 2018: 5000 }, { 2025: 9000 }, 2025, { plafondAnnuel: 8000, reportAns: 5 });
  ok(ip2.impute === 0 && ip2.reste === 0, 'imputation des pertes : report au-delà de 5 ans perdu');
  const vf = C.vueFiscale({ annee: 2025, interets: [{ nom: 'Prêt A', plat: 'BienPrêter', brut: 100, ir: 12.8, ps: 18.6, pret: true }, { nom: 'Prêt B', plat: 'BienPrêter', brut: 50, ir: 6.4, ps: 9.3, pret: true }, { nom: 'Livret bancaire', plat: 'Banque', brut: 30, estime: true }],
    dividendes: [{ nom: 'TTE', m: 40 }], ventes: { n: 1, gains: 0, pertes: 80, net: -80 }, pertes: { 2025: 60 }, interetsPretsParAn: { 2025: 150 }, enDefaut: [{ nom: 'Projet X', m: 1000, pret: true }], etrangers: ['Trade Republic'] }, CFG, {});
  const L = k => vf.lignes.find(x => x.cle === k);
  ok(vf.plateformes[0].plat === 'BienPrêter' && vf.plateformes[0].brut === 150 && vf.plateformes[0].net === 102.9 && vf.totaux.retenuIR === 19.2 && vf.totaux.basePS === 150, 'vue fiscale : intérêts par plateforme, prélèvements retenus');
  ok(L('interetsPrets').cases === '2TT' && L('interetsPrets').certitude === 'a_verifier' && L('interets').cases === '2TR' && L('acompte').cases === '2CK' && L('dejaSoumisPS').cases === '2BH' && L('ventes').cases === '3VH' && L('pertes').montant === 60 && /reportable/.test(L('pertes').note), 'vue fiscale : cases tirées du fichier de configuration, certitude affichée');
  ok(vf.imputation.impute === 60 && vf.comparaison.base === 160 && vf.rappels.some(r => /3916/.test(r)) && vf.rappels.some(r => /Projet X/.test(r) && /définitive/.test(r)), 'vue fiscale : pertes imputées avant comparaison, rappels (étranger, défaut)');
}

ok(C.fraisBancaires([{ d: '2026-10-31', lib: 'COTISATION CARTE', m: -10, cat: 'autre' }], new Date('2026-10-31T00:30:00')).total === 10, 'frais bancaires : une opération du jour compte même avant midi');
console.log('calculs :', n, 'contrôles réussis');
