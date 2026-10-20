/* Patrimoine AI — calculs sans affichage (produit par QuenTools).
   Relevés bancaires (CSV, OFX, QIF), catégories des dépenses, abonnements, budget réel, rendement réel (TRI),
   simulation de l'indépendance financière, fiscalité (vente, plus-value immobilière, succession, donation, IFI),
   revenus passifs, rappels de paiement et rapprochement avec les opérations de la banque. Fonctions pures, testées par tests/calculs.test.js ; l'interface est dans index.html. */
(function (root) {
  'use strict';
  const num = x => { const n = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const r2 = x => Math.round(x * 100) / 100;
  const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
  const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const jour = s => { const d = new Date(s + 'T12:00:00'); return isNaN(d) ? null : d; };
  const mois = s => String(s || '').slice(0, 7);

  /* ===================== Relevés bancaires ===================== */
  /* Montant écrit à la française ou à l'anglaise : « 1 234,56 », « -12,30 € », « 1.234,56 », « (12.30) », « 12,30- » */
  function lireMontant(s) {
    let t = String(s ?? '').trim().replace(/[  \s]/g, '').replace(/(eur|€|euros?)$/i, '').replace(/^\+/, '');
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    if (/-$/.test(t)) { neg = true; t = t.slice(0, -1); }
    if (/^-/.test(t)) { neg = !neg; t = t.slice(1); }
    if (!/^[\d.,']+$/.test(t)) return null;
    t = t.replace(/'/g, '');
    const c = t.lastIndexOf(','), p = t.lastIndexOf('.');
    if (c >= 0 && p >= 0) t = c > p ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
    else if (c >= 0) t = /,\d{3}$/.test(t) && (t.match(/,/g) || []).length > 1 ? t.replace(/,/g, '') : t.replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return isFinite(n) ? (neg ? -n : n) : null;
  }
  /* Date en AAAA-MM-JJ : « 15/10/2026 », « 15/10/26 », « 2026-10-15 », « 15.10.2026 », « 20261015 » (OFX) */
  function lireDate(s) {
    const t = String(s || '').trim();
    let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(t), y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if ((m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})\b/.exec(t))) { d = +m[1]; mo = +m[2]; y = +m[3]; if (y < 100) y += 2000; }
    else return null;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }
  function decouperCSV(texte) {
    const L = String(texte || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    const echant = L.slice(0, 15).join('\n'), cpt = c => (echant.match(new RegExp(c === '\t' ? '\t' : '\\' + c, 'g')) || []).length;
    const sep = [';', '\t', ','].sort((a, b) => cpt(b) - cpt(a))[0];
    return L.map(l => {
      const out = []; let cur = '', q = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (q) { if (ch === '"') { if (l[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
        else if (ch === '"') q = true; else if (ch === sep) { out.push(cur.trim()); cur = ''; } else cur += ch;
      }
      out.push(cur.trim()); return out;
    });
  }
  function colonnes(entete) {
    const h = entete.map(norm), trouve = (re, sauf) => h.findIndex(x => re.test(x) && !(sauf && sauf.test(x)));
    let date = trouve(/^date ?(de l ?)?op|^dateop|^date operation|^date$/);
    if (date < 0) date = trouve(/date/, /valeur|val\b/);
    if (date < 0) date = trouve(/date/);
    const lib = trouve(/libelle|label|description|intitule|operation|nature|payee|beneficiaire|detail|memo|motif/, /date|montant|categor/);
    const montant = trouve(/^montant|amount|^somme|^valeur$|^solde operation/, /date/);
    const debit = trouve(/debit/), credit = trouve(/credit/, /carte de credit/);
    const lib2 = h.findIndex((x, i) => i !== lib && /detail|complement|memo|commentaire|comment/.test(x));
    return { date, lib, montant, debit, credit, lib2 };
  }
  function lireCSV(texte) {
    const R = decouperCSV(texte), ops = []; let err = 0, k = -1, C = null;
    for (let i = 0; i < Math.min(R.length, 30); i++) { const c = colonnes(R[i]); if (c.date >= 0 && (c.montant >= 0 || c.debit >= 0 || c.credit >= 0)) { k = i; C = c; break; } }
    const lignes = k >= 0 ? R.slice(k + 1) : R;
    for (const r of lignes) {
      let d = null, m = null, lib = '';
      if (C) {
        d = lireDate(r[C.date]);
        if (C.montant >= 0 && r[C.montant] !== '' && r[C.montant] != null) m = lireMontant(r[C.montant]);
        else { const de = C.debit >= 0 ? lireMontant(r[C.debit]) : null, cr = C.credit >= 0 ? lireMontant(r[C.credit]) : null; if (de != null || cr != null) m = (cr || 0) - Math.abs(de || 0); }
        lib = C.lib >= 0 ? r[C.lib] || '' : '';
        if (C.lib2 >= 0 && r[C.lib2] && norm(r[C.lib2]) !== norm(lib)) lib = (lib + ' ' + r[C.lib2]).trim();
      } else { // sans entête : première date, dernier nombre, texte le plus long
        for (const x of r) { if (!d) d = lireDate(x); }
        for (let j = r.length - 1; j >= 0 && m == null; j--) { if (!lireDate(r[j])) { const v = lireMontant(r[j]); if (v != null && /[.,]\d{2}\s*(€|eur)?$/i.test(r[j].trim())) m = v; } }
        lib = r.filter(x => !lireDate(x) && lireMontant(x) == null).sort((a, b) => b.length - a.length)[0] || '';
      }
      if (!d || m == null || !isFinite(m)) { if (r.some(x => x)) err++; continue; }
      if (m === 0) continue;
      ops.push({ d, lib: lib.replace(/\s+/g, ' ').trim().slice(0, 140), m: r2(m) });
    }
    return { format: 'CSV', ops, erreurs: k >= 0 ? err : Math.max(0, err - 1) };
  }
  function lireOFX(texte) {
    const t = String(texte || ''), ops = []; let err = 0;
    const blocs = t.split(/<STMTTRN>/i).slice(1);
    const champ = (b, n) => { const m = new RegExp('<' + n + '>([^<\\r\\n]*)', 'i').exec(b); return m ? m[1].trim() : ''; };
    for (const b0 of blocs) {
      const b = b0.split(/<\/STMTTRN>/i)[0], d = lireDate(champ(b, 'DTPOSTED')), m = lireMontant(champ(b, 'TRNAMT'));
      const nom = champ(b, 'NAME'), memo = champ(b, 'MEMO'), id = champ(b, 'FITID');
      if (!d || m == null) { err++; continue; }
      const lib = (nom && memo && !norm(nom).includes(norm(memo)) && !norm(memo).includes(norm(nom)) ? nom + ' ' + memo : (nom.length >= memo.length ? nom : memo)).replace(/&amp;/g, '&');
      if (m) ops.push({ d, lib: lib.slice(0, 140), m: r2(m), fid: id || undefined });
    }
    return { format: 'OFX', ops, erreurs: err };
  }
  function lireQIF(texte) {
    const ops = []; let err = 0, cur = {};
    for (const l of String(texte || '').split(/\r?\n/)) {
      const c = l[0], v = l.slice(1).trim();
      if (c === 'D') { const m = /^(\d{1,2})\/(\d{1,2})['/](\d{2,4})/.exec(v); cur.d = m ? lireDate(m[1] + '/' + m[2] + '/' + m[3]) : lireDate(v); }
      else if (c === 'T' || c === 'U') cur.m = lireMontant(v);
      else if (c === 'P') cur.lib = v; else if (c === 'M' && !cur.lib) cur.lib = v;
      else if (c === '^') { if (cur.d && cur.m != null) { if (cur.m) ops.push({ d: cur.d, lib: (cur.lib || '').slice(0, 140), m: r2(cur.m) }); } else if (Object.keys(cur).length) err++; cur = {}; }
    }
    return { format: 'QIF', ops, erreurs: err };
  }
  function lireReleve(texte) {
    const t = String(texte || '');
    if (/<STMTTRN>/i.test(t)) return lireOFX(t);
    if (/^\s*!Type:/im.test(t)) return lireQIF(t);
    return lireCSV(t);
  }

  /* ===================== Catégories ===================== */
  const CATEGORIES = { revenu: 'Revenus', logement: 'Logement', energie: 'Énergie', telecom: 'Internet et téléphone', assurance: 'Assurances', transport: 'Transport', abonnement: 'Abonnements', impots: 'Impôts', enfants: 'Enfants', alimentation: 'Courses', sante: 'Santé', loisirs: 'Loisirs et sorties', autre: 'Autre', credit: 'Crédits', retrait: 'Retraits d’espèces', epargne: 'Épargne et placements', virement: 'Virements entre comptes' };
  const HORS_DEPENSES = ['revenu', 'epargne', 'virement'];
  const REGLES = [
    ['virement', /\b(virement|vir) (interne|entre (mes )?comptes|de compte a compte)|transfert entre comptes|\bvir(ement)? (vers|de) (mon|ma) (compte|livret)/],
    ['epargne', /\b(livret|ldds|lep|pel|cel|codevi|assurance[ -]?vie|versement (libre|programme)|epargne|pea\b|per\b|trade republic|boursobank bourse|degiro|interactive brokers|bourse direct|fortuneo bourse|yomoni|nalo|linxea|placement-direct|scpi|bienpreter|la premiere brique|homunity|anaxago|enerfip|tudigo|fundimmo|raizers|bricks|coinbase|binance|kraken|bitpanda|bitstack|deblock)\b/],
    ['retrait', /\b(retrait|ret dab|dab|distributeur|withdrawal|atm)\b/],
    ['credit', /\b(ech(eance)? (de )?pret|remb(oursement)? (de )?pret|pret immo|credit immo|cofidis|cetelem|sofinco|franfinance|oney|younited|floa|echeance credit|mensualite credit)\b/],
    ['impots', /\b(dgfip|impots?|tresor public|finances publiques|taxe (fonciere|habitation)|amende|antai|urssaf|prelevement a la source)\b/],
    ['logement', /\b(loyer|syndic|copropriete|foncia|nexity|citya|orpi gestion|century 21 gestion|square habitat|agence immo|bailleur|hlm|habitat)\b/],
    ['energie', /\b(edf|engie|totalenergies (electricite|gaz)|total energie|ekwateur|enercoop|eni gaz|mint energie|ohm energie|octopus energy|vattenfall|alpiq|gaz de bordeaux|electricite|veolia|suez|saur|eau de paris|compagnie des eaux)\b/],
    ['abonnement', /\b(netflix|spotify|deezer|disney ?\+?|disney plus|canal ?\+|canal plus|amazon prime|prime video|apple\.com|itunes|icloud|google (one|storage|play)|youtube premium|dazn|molotov|ocs|audible|kindle unlimited|adobe|microsoft 365|office 365|dropbox|openai|chatgpt|basic[ -]?fit|fitness park|keepcool|neoness|orange bleue|on air fitness|crunch fitness|le monde abo|abonnement)\b/],
    ['telecom', /\b(orange|sosh|sfr|red by sfr|bouygues telecom|b ?& ?you|free mobile|free telecom|freebox|la poste mobile|prixtel|nrj mobile|coriolis|syma|lebara|lycamobile)\b/],
    ['assurance', /\b(axa|maif|macif|maaf|matmut|gmf|allianz|generali|groupama|mma|mutuelle|harmonie|alan|april|direct assurance|olivier assurance|luko|lovys|acheel|leocare|swiss ?life|ag2r|malakoff|mgen|aesio|ociane|assurance)\b/],
    ['enfants', /\b(creche|cantine|garderie|periscolaire|nounou|pajemploi|cesu|assistante maternelle|vertbaudet|okaidi|king jouet|grande recre|cyrillus|jacadi)\b/],
    ['sante', /\b(pharmacie|pharma|docteur|dr |medecin|doctolib|dentiste|dentaire|kine|kinesitherapeute|opticien|optique|krys|afflelou|optic 2000|laboratoire|labo|hopital|clinique|osteopathe|psychologue|orthophoniste|radiologie)\b/],
    ['alimentation', /\b(carrefour|leclerc|auchan|intermarche|lidl|aldi|monoprix|monop|franprix|casino|super u|hyper u|systeme u|u express|coop|picard|grand frais|biocoop|naturalia|cora|netto|leader price|spar|vival|g20|la vie claire|boulangerie|boucherie|primeur|epicerie|supermarche|marche)\b/],
    ['transport', /\b(sncf|ouigo|ratp|navigo|uber(?! ?eats)|bolt|heetch|blablacar|esso|bp|shell|avia|total access|totalenergies station|station|carburant|peage|vinci autoroutes|sanef|aprr|asf|autoroute|parking|indigo|effia|velib|lime|tier|dott|tcl|rtm|tisseo|keolis|transdev|air france|easyjet|ryanair|transavia|vueling|norauto|feu vert|midas|speedy|controle technique)\b/],
    ['loisirs', /\b(restaurant|resto|brasserie|bistrot|cafe|bar|pizzeria|sushi|kebab|mcdonald ?s?|mc ?do|burger king|kfc|quick|subway|starbucks|uber ?eats|deliveroo|just ?eat|cinema|ugc|pathe|gaumont|mk2|fnac|cultura|steam|playstation|nintendo|xbox|ticketmaster|airbnb|booking|hotel|bowling|musee|parc|concert|theatre|spectacle)\b/],
    ['autre', /\b(amazon|cdiscount|ikea|leroy merlin|castorama|bricomarche|brico depot|boulanger|darty|zalando|vinted|h ?& ?m|zara|primark|kiabi|uniqlo|decathlon|intersport|go sport|sephora|nocibe|action|gifi|la poste|paypal)\b/]
  ];
  const SALAIRE = /\b(salaire|paie|remuneration|traitement|pole emploi|france travail|caf|allocations?|pension|retraite|carsat|agirc|arrco|indemnites?|prime|dividende|interets crediteurs)\b/;
  /* Clé d'un libellé : les deux ou trois premiers mots utiles (« CB CARREFOUR 12/10 CARTE 4567 » → « carrefour ») */
  const BRUIT = /\b(cb|carte|cbe|prlv|prelevement|prel|sepa|vir|virement|recu|emis|sct|inst|instantane|paiement|achat|ech|facture|fact|du|le|la|les|de|des|en|a|au|par|avec|ref|reference|mandat|ics|rum|n|no|num|cpte|compte|europe|fr|france|sas|sa|sarl|eurl|www|com|paris)\b/g;
  function cleLibelle(lib) {
    const t = norm(lib).replace(/[0-9]+/g, ' ').replace(/[^a-z& ]/g, ' ').replace(BRUIT, ' ').replace(/\s+/g, ' ').trim();
    return t.split(' ').filter(w => w.length > 1).slice(0, 3).join(' ');
  }
  function categoriser(lib, m, regles) {
    const t = ' ' + norm(lib).replace(/[*\/_\-.]/g, ' ').replace(/\s+/g, ' ') + ' ', k = cleLibelle(lib);
    if (regles && k && regles[k]) return regles[k];
    if (m > 0 && SALAIRE.test(t)) return 'revenu';
    for (const [c, re] of REGLES) if (re.test(t)) { if (m > 0 && (c === 'autre' || c === 'credit' || c === 'impots')) return 'revenu'; return c; }
    return m > 0 ? 'revenu' : 'autre';
  }
  /* Opérations nouvelles seulement (même jour, même montant, même libellé ou même identifiant bancaire) */
  const cleOp = o => o.fid ? 'f:' + o.fid : o.d + '|' + r2(o.m) + '|' + norm(o.lib).slice(0, 40);
  function fusionnerOps(anciennes, nouvelles, regles, src) {
    const vus = new Set((anciennes || []).map(cleOp)), ajout = [];
    for (const o of nouvelles || []) { const k = cleOp(o); if (vus.has(k)) continue; vus.add(k); ajout.push({ id: 'o' + Math.random().toString(36).slice(2, 10), d: o.d, lib: o.lib, m: o.m, fid: o.fid, cat: categoriser(o.lib, o.m, regles), src: src || '' }); }
    return ajout;
  }

  /* ===================== Budget réel ===================== */
  const depense = o => !HORS_DEPENSES.includes(o.cat);
  function moisDispo(ops) { return [...new Set((ops || []).map(o => mois(o.d)))].sort(); }
  /* Dépenses par catégorie d'un mois (un remboursement en positif réduit la catégorie) et revenus du mois */
  function reelDuMois(ops, m) {
    const L = (ops || []).filter(o => mois(o.d) === m), cat = {};
    let dep = 0, rev = 0, epa = 0;
    for (const o of L) {
      if (o.cat === 'revenu') rev += o.m;
      else if (o.cat === 'epargne') epa += -o.m;
      else if (o.cat === 'virement') continue;
      else { cat[o.cat] = (cat[o.cat] || 0) - o.m; dep += -o.m; }
    }
    Object.keys(cat).forEach(k => { cat[k] = r2(cat[k]); });
    return { mois: m, n: L.length, dep: r2(dep), rev: r2(rev), epargne: r2(epa), cat };
  }
  /* Comparaison avec le budget prévu : catPrevu = { categorie: montant mensuel prévu } */
  function comparer(prevu, reel, seuil = 0.1) {
    const cles = [...new Set([...Object.keys(prevu || {}), ...Object.keys(reel.cat || {})])];
    const L = cles.map(k => { const p = num(prevu[k]), r = num(reel.cat[k]); return { cat: k, prevu: r2(p), reel: r2(r), ecart: r2(r - p) }; })
      .filter(x => x.prevu > 0 || Math.abs(x.reel) >= 1).sort((a, b) => b.ecart - a.ecart);
    const depasse = L.filter(x => x.reel > x.prevu * (1 + seuil) && x.reel - x.prevu >= 20);
    return { lignes: L, depasse };
  }
  /* Moyenne mensuelle par catégorie sur les derniers mois complets (pour préremplir le budget) */
  function moyennes(ops, nbMois = 3, auj = new Date()) {
    const courant = iso(auj).slice(0, 7), M = moisDispo(ops).filter(m => m < courant).slice(-nbMois);
    if (!M.length) return null;
    const cat = {}; let rev = 0;
    for (const m of M) { const r = reelDuMois(ops, m); rev += r.rev; Object.entries(r.cat).forEach(([k, v]) => { cat[k] = (cat[k] || 0) + v; }); }
    Object.keys(cat).forEach(k => { cat[k] = Math.round(cat[k] / M.length); if (cat[k] <= 0) delete cat[k]; });
    return { mois: M, cat, rev: Math.round(rev / M.length) };
  }
  /* Abonnements et prélèvements réguliers : même libellé, montant stable, tous les mois (ou tous les ans) */
  /* catégories où l'on trouve des abonnements (pas le loyer, les courses, les crédits ni les impôts) */
  const ABONNABLES = ['abonnement', 'telecom', 'assurance', 'energie', 'transport', 'enfants', 'loisirs', 'sante', 'autre'];
  function abonnements(ops, auj = new Date()) {
    const G = {}, limite = new Date(auj); limite.setMonth(limite.getMonth() - 26);
    for (const o of ops || []) {
      if (!(o.m < 0) || !ABONNABLES.includes(o.cat)) continue;
      const dt = jour(o.d); if (!dt || dt < limite) continue;
      const k = cleLibelle(o.lib); if (!k) continue; (G[k] = G[k] || []).push({ t: dt, m: -o.m, o });
    }
    const out = [];
    for (const [k, L0] of Object.entries(G)) {
      const L = L0.sort((a, b) => a.t - b.t), ms = new Set(L.map(x => iso(x.t).slice(0, 7)));
      if (ms.size < 2) continue;
      const mont = L.map(x => x.m).sort((a, b) => a - b), med = mont[Math.floor(mont.length / 2)];
      const stables = L.filter(x => Math.abs(x.m - med) <= Math.max(1, med * 0.15));
      if (stables.length < 2) continue;
      const ec = []; for (let i = 1; i < stables.length; i++) ec.push((stables[i].t - stables[i - 1].t) / 864e5);
      ec.sort((a, b) => a - b); const e = ec[Math.floor(ec.length / 2)];
      let freq = null;
      if (e >= 25 && e <= 36 && stables.length >= 3) freq = 'mensuel';
      else if (e >= 80 && e <= 100 && stables.length >= 2) freq = 'trimestriel';
      else if (e >= 330 && e <= 400) freq = 'annuel';
      if (!freq) continue;
      const der = stables[stables.length - 1], parAn = freq === 'mensuel' ? med * 12 : freq === 'trimestriel' ? med * 4 : med;
      const attente = freq === 'mensuel' ? 45 : freq === 'trimestriel' ? 110 : 400, arrete = (auj - der.t) / 864e5 > attente;
      out.push({ cle: k, nom: der.o.lib, montant: r2(med), freq, parAn: Math.round(parAn), dernier: iso(der.t), cat: der.o.cat, nb: stables.length, arrete });
    }
    return out.sort((a, b) => b.parAn - a.parAn);
  }

  /* ===================== Rendement réel (taux de rendement interne) ===================== */
  /* flux : [{d:'AAAA-MM-JJ', m: + versement, − retrait}] ; valeur : ce que vaut le placement aujourd'hui */
  function tri(flux, valeur, auj = new Date()) {
    const F = (flux || []).map(f => ({ t: jour(f.d), m: num(f.m) })).filter(f => f.t && f.m).sort((a, b) => a.t - b.t);
    if (!F.length) return null;
    const t0 = F[0].t, T = (auj - t0) / 864e5 / 365.25, verse = F.reduce((s, f) => s + f.m, 0), V = num(valeur);
    const net = F.filter(f => f.m > 0).reduce((s, f) => s + f.m, 0);
    const res = { jours: Math.round(T * 365.25), verse: r2(verse), gain: r2(V - verse), simple: net > 0 ? (V - verse) / net : null, tri: null };
    if (T < 30 / 365.25) return res;
    const van = r => F.reduce((s, f) => s - f.m / Math.pow(1 + r, (f.t - t0) / 864e5 / 365.25), 0) + V / Math.pow(1 + r, T);
    let a = -0.99, b = 10, fa = van(a), fb = van(b);
    if (!(fa * fb < 0)) return res;
    for (let i = 0; i < 200; i++) { const c = (a + b) / 2, fc = van(c); if (Math.abs(fc) < 1e-7) { a = b = c; break; } if (fa * fc < 0) { b = c; fb = fc; } else { a = c; fa = fc; } }
    res.tri = (a + b) / 2;
    return res;
  }
  /* Valeur qu'auraient aujourd'hui les mêmes versements placés à un taux fixe (Livret A…) */
  function aTauxFixe(flux, taux, auj = new Date()) {
    return r2((flux || []).reduce((s, f) => { const t = jour(f.d); if (!t) return s; const a = Math.max(0, (auj - t) / 864e5 / 365.25); return s + num(f.m) * Math.pow(1 + taux / 100, a); }, 0));
  }
  /* Valeur qu'auraient les mêmes versements investis dans un indice : cours = [[horodatage ms, cours]] triés */
  function dansIndice(flux, cours) {
    if (!cours || cours.length < 2) return null;
    const dernier = cours[cours.length - 1][1]; let v = 0;
    for (const f of flux || []) {
      const t = jour(f.d); if (!t) continue; const ms = +t;
      if (ms < cours[0][0] - 45 * 864e5) return null; // l'indice ne remonte pas assez loin
      let p = cours[0][1]; for (const [x, c] of cours) { if (x <= ms + 864e5) p = c; else break; }
      v += num(f.m) * dernier / p;
    }
    return r2(v);
  }
  /* Coût des frais de gestion sur une durée : écart entre rendement brut et rendement diminué des frais */
  function coutFrais(valeur, frais, ans = 20, brut = 5) {
    const V = num(valeur), f = num(frais) / 100, r = brut / 100;
    return { parAn: r2(V * f), total: Math.round(V * (Math.pow(1 + r, ans) - Math.pow(1 + r - f, ans))) };
  }

  /* ===================== Indépendance financière (simulation de Monte-Carlo) ===================== */
  const SCENARIOS = { prudent: { nom: 'Prudent', r: 2, s: 6 }, moyen: { nom: 'Moyen', r: 4, s: 11 }, favorable: { nom: 'Favorable', r: 5.5, s: 15 } };
  function hasard(graine) { let a = graine >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  /* p : {age, capital, epargne (par mois), depenses (par mois, retraite), pension (par mois), ageCible, retrait (%), horizon (âge)} ; montants en euros d'aujourd'hui, rendements réels (après inflation) */
  function independance(p, n = 2000, graine = 7) {
    const age = Math.max(16, Math.min(90, Math.round(num(p.age) || 35))), horizon = Math.max(age + 1, Math.round(num(p.horizon) || 95));
    const besoin = Math.max(0, num(p.depenses) - num(p.pension)) * 12, retrait = Math.max(1, num(p.retrait) || 4) / 100;
    const cible = besoin / retrait, ageCible = Math.max(age, Math.round(num(p.ageCible) || 64)), ep = num(p.epargne) * 12, cap0 = Math.max(0, num(p.capital));
    const det = {};
    for (const [k, S] of Object.entries(SCENARIOS)) {
      let c = cap0, a = null;
      for (let y = 0; y <= horizon - age; y++) { if (a == null && c >= cible) a = age + y; if (y === horizon - age) break; c = c * (1 + S.r / 100) + ep; }
      det[k] = { nom: S.nom, r: S.r, age: a, capitalCible: Math.round(cap0 * Math.pow(1 + S.r / 100, ageCible - age) + ep * ((Math.pow(1 + S.r / 100, ageCible - age) - 1) / (S.r / 100))) };
    }
    // Monte-Carlo (scénario moyen) : rendement annuel tiré au hasard, épargne jusqu'à l'âge visé, puis retraits
    const S = SCENARIOS.moyen, mu = Math.log(1 + S.r / 100) - Math.pow(S.s / 100, 2) / 2, rnd = hasard(graine);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); while (!v) v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const annees = horizon - age, mat = Array.from({ length: annees + 1 }, () => new Float64Array(n));
    let atteint = 0, tient = 0;
    for (let i = 0; i < n; i++) {
      let c = cap0, ok = cap0 >= cible, dure = true; mat[0][i] = c;
      for (let y = 1; y <= annees; y++) {
        const g = Math.exp(mu + (S.s / 100) * gauss()), a = age + y - 1;
        c = a < ageCible ? c * g + ep : Math.max(0, c * g - besoin);
        if (a + 1 <= ageCible && c >= cible) ok = true;
        if (a + 1 > ageCible && c <= 0) dure = false;
        mat[y][i] = c;
      }
      if (ok) atteint++; if (dure) tient++;
    }
    const pc = (arr, q) => { const s = Array.from(arr).sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
    const bandes = { p10: [], p50: [], p90: [] };
    mat.forEach((arr, y) => { bandes.p10.push({ t: age + y, v: pc(arr, 0.1) }); bandes.p50.push({ t: age + y, v: pc(arr, 0.5) }); bandes.p90.push({ t: age + y, v: pc(arr, 0.9) }); });
    return { age, ageCible, horizon, cible: Math.round(cible), besoin: Math.round(besoin), scenarios: det, probaAtteinte: atteint / n, probaDuree: tient / n, bandes, n };
  }

  /* ===================== Fiscalité (règles françaises, montants 2026, indicatif) ===================== */
  const FISC = { ir: 12.8, ps: 18.6, psAV: 17.2, avAbat: [4600, 9200], av8: 7.5, avSeuil: 150000, pvImmoIR: 19, pvImmoPS: 17.2 };
  /* Plus-value immobilière (hors résidence principale) : abattements pour durée de détention et surtaxe au-delà de 50 000 € */
  function abattementsImmo(ans) {
    const a = Math.floor(num(ans)); let ir = 0, ps = 0;
    for (let k = 6; k <= Math.min(a, 21); k++) { ir += 6; ps += 1.65; }
    if (a >= 22) { ir += 4; ps += 1.6; }
    for (let k = 23; k <= Math.min(a, 30); k++) ps += 9;
    return { ir: Math.min(100, ir), ps: Math.min(100, r2(ps)) };
  }
  function surtaxeImmo(pv) {
    const T = [[50000, 60000, 2, 20], [60000, 100000, 2], [100000, 110000, 3, 10], [110000, 150000, 3], [150000, 160000, 4, 100 / 15], [160000, 200000, 4], [200000, 210000, 5, 5], [210000, 250000, 5], [250000, 260000, 6, 4], [260000, Infinity, 6]];
    if (pv <= 50000) return 0;
    for (const [a, b, t, lisse] of T) if (pv > a && pv <= b) return Math.round(lisse ? pv * t / 100 - (b - pv) / lisse : pv * t / 100);
    return 0;
  }
  /* Impôt sur la vente d'un placement. o : {type, valeur, verse (total versé), vente (montant retiré), ans (détention), couple, tmi, bareme, rp} */
  function impotVente(o) {
    const V = num(o.valeur), P = num(o.verse), R = Math.min(V, num(o.vente) || V), ans = num(o.ans), t = o.type;
    const res = { type: t, vente: r2(R), gain: 0, impot: 0, ps: 0, total: 0, net: r2(R), detail: [] };
    const gainTotal = V - P, part = V > 0 ? R / V : 0, gain = Math.max(0, gainTotal * part);
    if (t === 'livret') { res.detail.push('Livret réglementé : intérêts exonérés d’impôt et de prélèvements sociaux.'); return res; }
    if (gainTotal <= 0) { res.gain = r2(gainTotal * part); res.detail.push('Pas de plus-value : rien à payer. Une moins-value sur compte-titres peut s’imputer sur les plus-values des 10 années suivantes.'); return res; }
    res.gain = r2(gain);
    if (t === 'bien') {
      if (o.rp) { res.detail.push('Résidence principale : plus-value exonérée.'); return res; }
      const ab = abattementsImmo(ans), bIR = gain * (1 - ab.ir / 100), bPS = gain * (1 - ab.ps / 100);
      res.impot = Math.round(bIR * FISC.pvImmoIR / 100 + surtaxeImmo(bIR)); res.ps = Math.round(bPS * FISC.pvImmoPS / 100);
      res.detail.push(`Abattements pour ${Math.floor(ans)} ans de détention : ${ab.ir} % sur l’impôt, ${ab.ps} % sur les prélèvements sociaux.`);
      if (surtaxeImmo(bIR)) res.detail.push('Surtaxe sur les plus-values de plus de 50 000 € comprise.');
    } else if (t === 'pea') {
      res.ps = Math.round(gain * FISC.ps / 100);
      if (ans < 5) { res.impot = Math.round(gain * FISC.ir / 100); res.detail.push('PEA de moins de 5 ans : le retrait entraîne en principe la clôture du plan (sauf exceptions).'); }
      else res.detail.push('PEA de plus de 5 ans : gains exonérés d’impôt sur le revenu, seuls les prélèvements sociaux sont dus.');
    } else if (t === 'av') {
      res.ps = Math.round(gain * FISC.psAV / 100);
      if (ans < 8) { res.impot = Math.round(gain * (o.bareme ? num(o.tmi) : FISC.ir) / 100); res.detail.push('Contrat de moins de 8 ans : ' + (o.bareme ? 'barème progressif.' : 'prélèvement forfaitaire de 12,8 %.')); }
      else {
        const abat = FISC.avAbat[o.couple ? 1 : 0], imp = Math.max(0, gain - abat), taux = P <= FISC.avSeuil ? FISC.av8 : FISC.ir;
        res.impot = Math.round(imp * (o.bareme ? num(o.tmi) : taux) / 100);
        res.detail.push(`Contrat de plus de 8 ans : abattement de ${abat.toLocaleString('fr-FR')} € par an sur les gains, puis ${o.bareme ? 'barème' : String(taux).replace('.', ',') + ' %'}.`);
      }
      res.detail.push('Prélèvements sociaux de 17,2 % : le plus souvent déjà prélevés chaque année sur le fonds en euros.');
    } else if (t === 'per') {
      res.ps = Math.round(gain * FISC.ps / 100); res.impot = Math.round(gain * FISC.ir / 100) + Math.round(Math.min(P, R) * num(o.tmi || 30) / 100);
      res.detail.push('PER, sortie en capital : les versements déduits à l’entrée sont imposés au barème (tranche choisie), les gains au prélèvement forfaitaire.');
    } else { // compte-titres, crypto, crowdfunding, autre
      res.ps = Math.round(gain * FISC.ps / 100);
      res.impot = Math.round(gain * (o.bareme ? num(o.tmi) * (1 - 0.068) : FISC.ir) / 100);
      res.detail.push(o.bareme ? 'Option pour le barème progressif (CSG déductible de 6,8 % prise en compte).' : 'Prélèvement forfaitaire unique : 12,8 % d’impôt et 18,6 % de prélèvements sociaux (31,4 %).');
    }
    res.total = res.impot + res.ps; res.net = r2(R - res.total);
    return res;
  }
  /* Droits de succession ou de donation selon le lien de parenté */
  const BAREMES = {
    ligne: [[8072, 5], [12109, 10], [15932, 15], [552324, 20], [902838, 30], [1805677, 40], [Infinity, 45]],
    conjoint: [[8072, 5], [15932, 10], [31865, 15], [552324, 20], [902838, 30], [1805677, 40], [Infinity, 45]],
    frere: [[24430, 35], [Infinity, 45]], neveu: [[Infinity, 55]], autre: [[Infinity, 60]]
  };
  const ABATTEMENTS = { enfant: 100000, petitenfant: 31865, conjoint: 80724, frere: 15932, neveu: 7967, autre: 1594 };
  function droits(base, lien) {
    const B = BAREMES[lien === 'enfant' || lien === 'petitenfant' ? 'ligne' : lien] || BAREMES.autre; let reste = Math.max(0, num(base)), bas = 0, d = 0;
    for (const [haut, t] of B) { if (reste <= 0) break; const tr = Math.min(reste, haut - bas); d += tr * t / 100; reste -= tr; bas = haut; }
    return Math.round(d);
  }
  /* Succession simplifiée : patrimoine (hors assurance-vie) partagé entre les enfants ; le conjoint (exonéré) reçoit le quart en pleine propriété s'il est choisi ;
     assurance-vie versée avant 70 ans : 152 500 € exonérés par bénéficiaire, puis 20 % jusqu'à 700 000 € et 31,25 % au-delà ; après 70 ans : 30 500 € pour tous puis droits normaux. */
  function succession(o) {
    const enfants = Math.max(0, Math.round(num(o.enfants))), patr = Math.max(0, num(o.patrimoine)), av = Math.max(0, num(o.av)), av70 = Math.max(0, num(o.avApres70));
    const conj = !!o.conjoint && enfants > 0 ? patr / 4 : (o.conjoint && !enfants ? patr : 0), resteEnf = enfants ? patr - conj : 0;
    const parEnf = enfants ? resteEnf / enfants : 0, deja = Math.max(0, num(o.donations));
    const av70Taxable = enfants ? Math.max(0, av70 - 30500) / enfants : 0, avParEnf = enfants ? av / enfants : 0;
    const base = Math.max(0, parEnf + av70Taxable - Math.max(0, ABATTEMENTS.enfant - deja)), d = enfants ? droits(base, 'enfant') : 0;
    const avTax = Math.max(0, avParEnf - 152500), dAV = Math.round(Math.min(avTax, 700000 - 152500) * 0.2 + Math.max(0, avTax - (700000 - 152500)) * 0.3125);
    return { enfants, conjoint: Math.round(conj), parEnfant: Math.round(parEnf + avParEnf + (enfants ? av70 / enfants : 0)), droitsParEnfant: d + dAV, droitsSuccession: d, droitsAV: dAV, total: (d + dAV) * enfants, base: Math.round(base) };
  }
  function donation(montant, lien, deja = 0, familial = false) {
    const ab = Math.max(0, (ABATTEMENTS[lien] || ABATTEMENTS.autre) - num(deja)) + (familial && (lien === 'enfant' || lien === 'petitenfant') ? 31865 : 0);
    return { abattement: ab, droits: droits(Math.max(0, num(montant) - ab), lien === 'conjoint' ? 'conjoint' : lien) };
  }
  /* Impôt sur la fortune immobilière : immobilier net de dettes (résidence principale abattue de 30 %) au-delà de 1,3 million */
  function ifi(net) {
    const P = Math.max(0, num(net)); if (P < 1300000) return 0;
    const T = [[800000, 0], [1300000, 0.5], [2570000, 0.7], [5000000, 1], [10000000, 1.25], [Infinity, 1.5]]; let bas = 0, d = 0;
    for (const [haut, t] of T) { const tr = Math.max(0, Math.min(P, haut) - bas); d += tr * t / 100; bas = haut; if (P <= haut) break; }
    if (P < 1400000) d -= 17500 - 0.0125 * P;
    return Math.max(0, Math.round(d));
  }

  /* ===================== Revenus passifs sur 12 mois ===================== */
  /* sources : [{type:'loyer'|'interets'|'dividendes'|'projets', nom, mois: [12 montants]}] → total par mois et par type */
  function revenusPassifs(sources) {
    const M = Array.from({ length: 12 }, () => ({ total: 0, par: {} }));
    for (const s of sources || []) (s.mois || []).forEach((v, k) => { if (k < 12 && v) { M[k].total += v; M[k].par[s.type] = (M[k].par[s.type] || 0) + v; } });
    M.forEach(x => { x.total = r2(x.total); });
    return { mois: M, total: r2(M.reduce((s, x) => s + x.total, 0)) };
  }
  /* Dividendes des 12 derniers mois (horodatages Yahoo en secondes) → montants par mois des 12 prochains mois, rang 0 = mois en cours */
  function dividendesAVenir(divs, quantite, auj = new Date()) {
    const out = Array(12).fill(0), q = num(quantite), il12 = new Date(auj); il12.setFullYear(il12.getFullYear() - 1);
    for (const x of divs || []) {
      const t = new Date(num(x.date) * 1000); if (!(t > il12) || t > auj) continue;
      const prochain = new Date(t); prochain.setFullYear(prochain.getFullYear() + 1);
      const k = (prochain.getFullYear() - auj.getFullYear()) * 12 + prochain.getMonth() - auj.getMonth();
      if (k >= 0 && k < 12) out[k] += num(x.amount) * q;
    }
    return out.map(r2);
  }

  /* ===================== Rappels de paiement mensuels (Bricks le 8, BienPrêter le 5…) ===================== */
  /* Un rappel : { jour, cree: 'AAAA-MM-JJ', hist: { 'AAAA-MM': { s: 'recu'|'absent', m, tx } }, actif, motif, attendu } */
  const ajoutJours = (s, k) => { const d = jour(s); d.setDate(d.getDate() + k); return iso(d); };
  const ecartJours = (a, b) => Math.round((jour(b) - jour(a)) / 864e5);
  const moisDecale = (m, k) => { const d = jour(m + '-15'); d.setMonth(d.getMonth() + k); return iso(d).slice(0, 7); };
  /* Date du paiement d'un mois ; un jour absent du mois (31 en avril) devient le dernier jour */
  function echeance(m, j) {
    const d = jour(m + '-15'), fin = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return m + '-' + String(Math.min(fin, Math.max(1, Math.round(num(j)) || 1))).padStart(2, '0');
  }
  /* Jours fériés français (fêtes fixes, lundi de Pâques, Ascension, lundi de Pentecôte) : un virement n'arrive pas ces jours-là */
  function paques(a) {
    const c = Math.floor(a / 100), u = a % 100, k = Math.floor(c / 4), l = c % 4, p = Math.floor((c + 8) / 25), q = Math.floor((c - p + 1) / 3), e = (19 * (a % 19) + c - k - q + 15) % 30,
      b = Math.floor(u / 4), d = u % 4, f = (32 + 2 * l + 2 * b - e - d) % 7, h = Math.floor(((a % 19) + 11 * e + 22 * f) / 451), mo = Math.floor((e + f - 7 * h + 114) / 31), j = ((e + f - 7 * h + 114) % 31) + 1;
    return new Date(a, mo - 1, j, 12);
  }
  function ferie(s) {
    const d = jour(s); if (!d) return false;
    const a = d.getFullYear(), fixes = ['01-01', '05-01', '05-08', '07-14', '08-15', '11-01', '11-11', '12-25'], P = paques(a), plus = n => { const x = new Date(P); x.setDate(x.getDate() + n); return iso(x); };
    return fixes.includes(s.slice(5)) || [plus(1), plus(39), plus(50)].includes(s);
  }
  const ouvre = s => { const d = jour(s).getDay(); return d !== 0 && d !== 6 && !ferie(s); };
  /* Date réellement attendue d'un rappel : le jour prévu ; un week-end ou un jour férié, le jour ouvré suivant
     (sauf si le rappel demande de ne pas décaler : « ouvre: false »). */
  function echeanceR(r, m) {
    let e = echeance(m, r.jour);
    if (r.ouvre === false) return e;
    for (let k = 0; k < 7 && !ouvre(e); k++) e = ajoutJours(e, 1);
    return e;
  }
  /* Montant habituel d'un rappel : celui saisi, sinon la médiane des trois derniers paiements reçus */
  function montantHabituel(r) {
    if (num(r.attendu) > 0) return r2(num(r.attendu));
    const V = Object.entries((r && r.hist) || {}).filter(([, h]) => h && h.s === 'recu' && num(h.m) > 0).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3).map(([, h]) => num(h.m)).sort((a, b) => a - b);
    return V.length ? r2(V[Math.floor(V.length / 2)]) : 0;
  }
  /* Paiements arrivés à échéance et pas encore validés (6 derniers mois au plus, jamais avant la création du rappel).
     Au-delà de « delai » jours sans validation, le paiement passe en retard. */
  function rappelsDus(rappels, auj, delai = 3) {
    const out = [];
    for (const r of rappels || []) {
      if (!r || r.actif === false || !(num(r.jour) >= 1)) continue;
      for (let k = 0, m = mois(auj); k < 6; k++, m = moisDecale(m, -1)) {
        const e = echeanceR(r, m);
        if (e > auj || (r.cree && e < r.cree) || (r.hist && r.hist[m])) continue;
        const j = ecartJours(e, auj);
        out.push({ r, mois: m, date: e, jours: j, statut: j > delai ? 'retard' : 'a_valider' });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  /* Prochaine date de paiement pas encore traitée (aujourd'hui compris) */
  function prochaineEcheance(r, auj) {
    for (let k = 0, m = mois(auj); k < 24; k++, m = moisDecale(m, 1)) { const e = echeanceR(r, m); if (e >= auj && !(r.hist && r.hist[m])) return e; }
    return null;
  }
  /* Rapprochement : un crédit sur le compte entre 3 jours avant et 10 jours après l'échéance, dont le libellé contient
     un des mots du rappel (séparés par |, sinon son nom). Un montant habituel proche départage ; une opération déjà
     utilisée pour un autre paiement est écartée. */
  function rapprocher(r, m, ops, utilises) {
    const e = echeanceR(r, m), deb = ajoutJours(e, -3), fin = ajoutJours(e, 10), att = montantHabituel(r);
    const mots = String(r.motif || r.nom || '').split('|').map(x => norm(x).replace(/[^a-z0-9]/g, '')).filter(x => x.length >= 3);
    if (!mots.length) return null;
    let best = null, bs = -Infinity;
    for (const o of ops || []) {
      if (!o || !(o.m > 0) || !o.d || o.d < deb || o.d > fin || (utilises && utilises.has(o.id))) continue;
      const lib = norm(o.lib).replace(/[^a-z0-9]/g, '');
      if (!mots.some(w => lib.includes(w))) continue;
      const s = (att > 0 && Math.abs(o.m - att) <= Math.max(1, att * 0.05) ? 10 : 0) - Math.abs(ecartJours(e, o.d)) / 10;
      if (s > bs) { bs = s; best = o; }
    }
    return best;
  }
  /* Mots du libellé d'un rappel (séparés par |, sinon son nom) */
  const motsDe = r => String(r.motif || r.nom || '').split('|').map(x => norm(x).replace(/[^a-z0-9]/g, '')).filter(x => x.length >= 3);
  /* Retraits probables vers la compte bancaire : crédits dont le libellé évoque la plateforme, reçus après la création du
     portefeuille, qui ne sont ni un paiement déjà validé ni une opération déjà traitée. La somme est plafonnée au solde du
     portefeuille. « ignorer » = opérations déjà refusées par l'utilisateur. */
  function retraitsPossibles(r, ops, utilises, solde, depuis) {
    const mots = motsDe(r), vu = new Set([...(utilises || []), ...((r.ret || []).map(x => x.tx))]);
    if (!mots.length || !(num(solde) > 0)) return [];
    return (ops || []).filter(o => o && o.m > 0 && o.d >= (depuis || '0000') && !vu.has(o.id) && mots.some(w => norm(o.lib).replace(/[^a-z0-9]/g, '').includes(w)))
      .sort((a, b) => a.d.localeCompare(b.d)).map(o => ({ op: o, somme: r2(Math.min(o.m, num(solde))) }));
  }
  /* Écarte les opérations nouvelles qui existent déjà dans « existantes » : même montant, à 2 jours près, une seule fois chacune
     (deux achats identiques le même jour restent deux opérations). Sert à ne pas compter deux fois une même opération reçue
     par la banque et par un relevé importé. */
  function ecarterDoublons(nouvelles, existantes, tol = 2) {
    const libres = (existantes || []).map(o => ({ o, pris: false }));
    return (nouvelles || []).filter(n => {
      let best = null, bd = Infinity;
      for (const e of libres) {
        if (e.pris || r2(e.o.m) !== r2(n.m)) continue;
        const d = Math.abs(ecartJours(e.o.d, n.d)); if (d <= tol && d < bd) { bd = d; best = e; }
      }
      if (best) { best.pris = true; return false; }
      return true;
    });
  }
  /* Opérations reçues de la banque (application Mac) → opérations du budget réel. Les opérations en attente et en
     devise sont ignorées ; une opération déjà importée par un relevé (même montant, à 2 jours près) n'est pas reprise. */
  function opsBanque(L, ref, existantes) {
    const ops = (L || []).filter(t => t && t.id && t.etat !== 'PDNG' && /^\d{4}-\d{2}-\d{2}$/.test(t.d) && isFinite(t.m) && t.m !== 0 && (!t.dev || t.dev === 'EUR'))
      .map(t => ({ d: t.d, lib: String(t.lib || 'Opération').slice(0, 140), m: r2(t.m), fid: 'eb:' + ref + ':' + t.id }));
    return ecarterDoublons(ops, (existantes || []).filter(o => !/^eb:/.test(o.fid || '')));
  }
  /* Opérations d'un compte d'épargne : ni dépenses ni revenus (le virement est déjà compté « mis de côté » sur le compte
     courant), sauf les intérêts, qui sont un revenu. */
  const pourEpargne = o => Object.assign({}, o, { cat: /\binterets?\b/.test(norm(o.lib)) && o.m > 0 ? 'revenu' : 'virement' });

  /* ===================== Calendrier (.ics) : rappels qui sonnent même application fermée ===================== */
  const icsT = s => String(s || '').replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\r?\n/g, '\\n');
  const icsD = s => s.replace(/-/g, '');
  /* Événements mensuels (un par rappel, alarme à 9 h le jour même et la veille) ; au-delà du 28, dernier jour du mois */
  function ics(rappels, auj, id = 'patrimoine') {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Patrimoine AI//Rappels//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Paiements attendus'];
    for (const r of (rappels || []).filter(r => r && r.actif !== false && num(r.jour) >= 1)) {
      const j = Math.round(num(r.jour)), m = mois(auj), e = echeance(m, j) < auj ? echeance(moisDecale(m, 1), j) : echeance(m, j), att = montantHabituel(r);
      L.push('BEGIN:VEVENT', 'UID:' + id + '-' + String(r.id).replace(/[^a-z0-9]/gi, '') + '@patrimoine-ai', 'DTSTAMP:' + icsD(auj) + 'T080000Z', 'DTSTART;VALUE=DATE:' + icsD(e),
        'RRULE:FREQ=MONTHLY;BYMONTHDAY=' + (j <= 28 ? j : -1), 'SUMMARY:' + icsT('Paiement ' + r.nom + ' attendu' + (att > 0 ? ' (environ ' + String(att).replace('.', ',') + ' €)' : '')),
        'DESCRIPTION:' + icsT('Ouvrez Patrimoine AI pour confirmer que le paiement de ' + r.nom + ' est bien arrivé.'), 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Paiement ' + icsT(r.nom), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT');
    }
    return L.concat('END:VCALENDAR').join('\r\n') + '\r\n';
  }
  /* Un seul événement daté (renouvellement de l'accord bancaire, quelques jours avant son expiration) */
  function icsUnique(uid, titre, description, date, auj) {
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Patrimoine AI//Banque//FR', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + uid + '@patrimoine-ai', 'DTSTAMP:' + icsD(auj) + 'T080000Z', 'DTSTART;VALUE=DATE:' + icsD(date),
      'SUMMARY:' + icsT(titre), 'DESCRIPTION:' + icsT(description), 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsT(titre), 'TRIGGER:PT9H', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n') + '\r\n';
  }

  const API = { num, norm, lireMontant, lireDate, decouperCSV, lireReleve, lireCSV, lireOFX, lireQIF, CATEGORIES, HORS_DEPENSES, categoriser, cleLibelle, fusionnerOps, cleOp, depense, moisDispo, reelDuMois, comparer, moyennes, abonnements,
    tri, aTauxFixe, dansIndice, coutFrais, SCENARIOS, independance, FISC, abattementsImmo, surtaxeImmo, impotVente, droits, succession, donation, ifi, ABATTEMENTS, revenusPassifs, dividendesAVenir,
    echeance, echeanceR, ferie, montantHabituel, rappelsDus, prochaineEcheance, rapprocher, retraitsPossibles, ecarterDoublons, opsBanque, pourEpargne, ics, icsUnique, ajoutJours };
  root.Calculs = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
