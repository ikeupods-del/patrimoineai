// Scénario navigateur : cours en direct (faux flux), accueil, écran Marchés, fiche d'une valeur.
// node tests/e2e.js [--photos dossier]   (Chromium de /opt/pw-browsers, serveur local)
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..'), SHOTS = process.argv.includes('--photos') ? process.argv[process.argv.indexOf('--photos') + 1] : null;
let n = 0; const NEWSQ = []; const ok = (c, m) => { assert(c, m); n++; };
const vi = x => { const o = []; while (x > 127) { o.push((x % 128) | 128); x = Math.floor(x / 128); } o.push(x); return o; };
const str = (f, s) => { const b = [...Buffer.from(s)]; return [...vi(f * 8 + 2), ...vi(b.length), ...b]; };
const flt = (f, v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return [...vi(f * 8 + 5), ...b]; };
const yahoo = o => JSON.stringify({ type: 'pricing', message: Buffer.from([...str(1, o.id), ...flt(2, o.price), ...vi(3 * 8), ...vi((Math.floor(Date.now() / 1000)) * 2), ...str(4, o.cur), ...vi(7 * 8), ...vi(1), ...flt(16, o.pc), ...flt(10, o.hi || o.price), ...flt(11, o.lo || o.price)]).toString('base64') });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
const srv = http.createServer((q, r) => { let f = path.join(ROOT, q.url.split('?')[0].replace(/^\/$/, '/index.html')); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); });
const PRICE = { AAPL: [190, 188, 'USD'], 'MC.PA': [700, 690, 'EUR'], 'CW8.PA': [500, 498, 'EUR'], '^FCHI': [8000, 7950, 'EUR'], '^GSPC': [5200, 5150, 'USD'], 'USDEUR=X': [0.9, 0.9, 'EUR'], 'EURUSD=X': [1.1, 1.1, 'USD'], 'BTC-EUR': [60000, 59000, 'EUR'] };
(async () => {
  await new Promise(r => srv.listen(0, r)); const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
  const SEARCHQ = []; const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await ctx.route(/corsproxy\.io|allorigins\.win/, r => {
    const u = decodeURIComponent(r.request().url().replace(/^.*?(url=)/, '')), m = /symbols=([^&]+)/.exec(u), c = /chart\/([^?]+)\?range=(\w+)/.exec(u);
    if (/news\.google\.com/.test(u)) { NEWSQ.push(u); const it = (t, src, h) => `<item><title>${t} - ${src}</title><link>https://news.google.com/rss/articles/${encodeURIComponent(t)}</link><pubDate>${new Date(Date.now() - h * 36e5).toUTCString()}</pubDate><source url="https://example.fr">${src}</source></item>`;
      return r.fulfill({ status: 200, contentType: 'application/rss+xml', body: `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${it('Le pétrole recule après la réunion de l&apos;OPEP', 'Les Echos', 1)}${it('La BCE maintient ses taux', 'Le Monde', 3)}${it('Le pétrole recule après la réunion de l&apos;OPEP', 'BFM', 4)}${it('Les marchés asiatiques en hausse', 'Reuters', 6)}${it('&lt;script&gt;alert(1)&lt;/script&gt; Titre piégé', 'Source', 8)}</channel></rss>` }); }
    if (m) return r.fulfill({ json: { spark: { result: decodeURIComponent(m[1]).split(',').map(s => ({ symbol: s, response: [{ meta: { regularMarketPrice: (PRICE[s] || [10, 10, 'EUR'])[0], chartPreviousClose: (PRICE[s] || [10, 10, 'EUR'])[1], currency: (PRICE[s] || [10, 10, 'EUR'])[2] } }] })) } } });
    if (c) { const s = decodeURIComponent(c[1]), p = (PRICE[s] || [10])[0], t0 = Math.floor(Date.now() / 1000) - 300 * 60; return r.fulfill({ json: { chart: { result: [{ meta: { currency: (PRICE[s] || [0, 0, 'EUR'])[2] }, timestamp: Array.from({ length: 60 }, (_, i) => t0 + i * 300), indicators: { quote: [{ close: Array.from({ length: 60 }, (_, i) => p * (0.99 + 0.01 * Math.sin(i / 6) + i * 0.0002)) }] } }] } } }); }
    const sq = /finance\/search\?q=([^&]+)/.exec(u); if (sq) { SEARCHQ.push(decodeURIComponent(sq[1])); return r.fulfill({ json: { quotes: /FR0011550185/.test(decodeURIComponent(sq[1])) ? [{ symbol: '^SPX', quoteType: 'INDEX' }, { symbol: 'ESE.MI', quoteType: 'ETF', shortname: 'BNP P.E. S&P 500' }, { symbol: 'ESE.PA', quoteType: 'ETF', shortname: 'BNP P.E. S&P 500' }] : [] } }); }
    r.fulfill({ status: 404, body: '' });
  });
  await ctx.route(/gstatic\.com|googleapis\.com|firebase/, r => r.abort());
  await ctx.addInitScript(() => {
    window.__ws = []; window.WebSocket = class { constructor(u) { this.url = u; this.sent = []; window.__ws.push(this); setTimeout(() => this.onopen && this.onopen(), 10); } send(m) { this.sent.push(m); } close() { this.onclose && this.onclose(); } };
    localStorage.setItem('pat_data', JSON.stringify({ assets: [
      { id: 'a1', cat: 'bourse', name: 'Apple', tick: 'AAPL', qty: 10, pru: 150, price: 180, prev: 178 },
      { id: 'a2', cat: 'bourse', name: 'Bitcoin', tick: 'BTC-EUR', qty: 0.1, pru: 40000, price: 59000, prev: 58000 },
      { id: 'a3', cat: 'cash', name: 'Livret A', amount: 5000 }], set: { theme: 'dark', mtab: 'cry' } }));
  });
  await pg.goto(base); await pg.waitForFunction(() => window.__ws.length >= 2, null, { timeout: 8000 });
  const wss = await pg.evaluate(() => window.__ws.map(w => w.url)); ok(wss.some(u => /binance/.test(u)) && wss.some(u => /yahoo/.test(u)), 'flux ouverts');
  const subs = await pg.evaluate(() => window.__ws.map(w => w.sent.join('|')).join('|')); ok(/btceur@ticker/.test(subs) && /AAPL/.test(subs) && /\^FCHI/.test(subs), 'abonnements : positions et indices');
  const tot0 = await pg.textContent('#h-tot');
  await pg.evaluate(m => { const w = window.__ws.find(x => /yahoo/.test(x.url)); w.onmessage({ data: m }); }, yahoo({ id: 'USDEUR=X', price: 0.9, cur: 'EUR', pc: 0.9 }));
  await pg.evaluate(m => { const w = window.__ws.find(x => /yahoo/.test(x.url)); w.onmessage({ data: m }); }, yahoo({ id: 'AAPL', price: 200, cur: 'USD', pc: 188 }));
  await pg.evaluate(() => { const w = window.__ws.find(x => /binance/.test(x.url)); w.onmessage({ data: JSON.stringify({ stream: 'btceur@ticker', data: { s: 'BTCEUR', c: '62000', o: '59000', E: Date.now(), h: '62500', l: '58000' } }) }); });
  await pg.waitForTimeout(400);
  const tot1 = await pg.textContent('#h-tot'); ok(tot0 !== tot1, 'total patrimoine mis à jour en direct (' + tot0 + ' → ' + tot1 + ')');
  const exp = Math.round(10 * 200 * 0.9 + 0.1 * 62000 + 5000); ok(tot1.replace(/\D/g, '') == String(exp), 'total attendu ' + exp + ' obtenu ' + tot1);
  ok((await pg.textContent('#h-day')).includes('Aujourd'), 'variation du jour affichée');
  ok(await pg.evaluate(() => /direct/.test(document.getElementById('lp').className) && !document.getElementById('lp').hidden), 'pastille Direct');
  await pg.evaluate(() => window.scrollTo(0, 0)); if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'accueil.png') });
  /* écran Marchés */
  await pg.click('#tmore'); await pg.click('.tile[data-v=mk]'); await pg.waitForSelector('#mkl .mkr'); await pg.waitForTimeout(300);
  ok(await pg.locator('#mkl .mkr').count() >= 10, 'liste crypto affichée (' + await pg.locator('#mkl .mkr').count() + ')');
  const btc = pg.locator('#mkl .mkr', { hasText: 'Bitcoin' }); ok((await btc.textContent()).replace(/\s/g, '').includes('62000'), 'Bitcoin à 62 000 € dans la liste');
  await pg.evaluate(() => { const w = window.__ws.find(x => /binance/.test(x.url)); w.onmessage({ data: JSON.stringify({ stream: 'btceur@ticker', data: { s: 'BTCEUR', c: '63500', o: '59000', E: Date.now() } }) }); });
  await pg.waitForTimeout(300); ok((await btc.textContent()).replace(/\s/g, '').includes('63500'), 'liste mise à jour sans rechargement');
  ok(await pg.evaluate(() => !!document.querySelector('#mkl .fl-up')), 'éclair vert sur la hausse');
  const chg = (await btc.locator('[data-k=c]').textContent()); ok(/\+7,63/.test(chg.replace(/\s/g, ' ')), 'variation Bitcoin ' + chg);
  ok((await pg.textContent('#mk-st')).includes('En direct'), 'bandeau « En direct »');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'marches.png') });
  /* onglet indices + fiche */
  await pg.click('[data-act=mktab][data-t=idx]'); await pg.waitForSelector('#mkl .mkr'); await pg.waitForTimeout(200);
  ok(await pg.locator('#mkl .mkr', { hasText: 'CAC 40' }).count() === 1, 'indices listés');
  await pg.evaluate(m => { const w = window.__ws.find(x => /yahoo/.test(x.url)); w.onmessage({ data: m }); }, yahoo({ id: '^FCHI', price: 8123.4, cur: 'EUR', pc: 8000 }));
  await pg.waitForTimeout(250); ok((await pg.locator('#mkl .mkr', { hasText: 'CAC 40' }).textContent()).replace(/\s/g, '').includes('8123'), 'CAC 40 en direct');
  await pg.click('#mkl .mkr:has-text("CAC 40")'); await pg.waitForSelector('#mkc svg', { timeout: 5000 });
  ok(await pg.locator('#sheet .big').count() === 1, 'fiche ouverte avec graphique du jour');
  await pg.evaluate(m => { const w = window.__ws.find(x => /yahoo/.test(x.url)); w.onmessage({ data: m }); }, yahoo({ id: '^FCHI', price: 8200, cur: 'EUR', pc: 8000 }));
  await pg.waitForTimeout(300); ok((await pg.textContent('#sheet .big')).replace(/\s/g, '').includes('8200'), 'prix de la fiche en direct');
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'fiche.png') });
  await pg.keyboard.press('Escape');
  /* placements */
  await pg.click('.tab[data-nav=assets]'); await pg.waitForTimeout(300); ok((await pg.textContent('#list')).replace(/\s/g, '').includes('Apple'), 'liste des placements');
  /* coupure : le secours rapide prend le relais */
  await pg.evaluate(() => { window.__ws.forEach(w => { w.onclose && w.onclose(); }); });
  await pg.waitForTimeout(500); ok(!errs.length, 'aucune erreur JavaScript : ' + errs.join(' | '));
  /* patrimoine net : bien immobilier et crédit (capital restant dû calculé) */
  const net = await pg.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 12); D.assets.push({ id: 'b1', cat: 'bien', name: 'Appartement', usage: 'rp', value: 200000, amount: 180000 }, { id: 'c1', cat: 'credit', name: 'Prêt', amount: 120000, rate: 3, dur: 240, date: d.toLocaleDateString('sv-SE'), value: '' }); save(); render(); const T = totals(), a = D.assets.find(x => x.id === 'c1'); return { crd: crd(a), m: loanM(a), net: T.net, tv: T.tv, debt: T.debt }; });
  ok(Math.abs(net.m - 665.52) < 0.5, 'mensualité du crédit ' + net.m.toFixed(2));
  ok(Math.abs(net.crd - 115553) < 20 && Math.abs(net.net - (net.tv - net.debt)) < 0.01, 'capital restant dû ' + Math.round(net.crd) + ', patrimoine net');
  ok((await pg.evaluate(() => { renderHome(); return $('h-lab').textContent; })) === 'Patrimoine net', 'accueil en patrimoine net');
  /* budget : épargne possible et plan d'investissement */
  await pg.click('#tmore'); await pg.click('.tile[data-v=tools]'); await pg.click('.tab[data-nav=budget]'); await pg.click('[data-act=bstart]'); await pg.waitForTimeout(120);
  const fill = async (sel, v) => { await pg.fill(sel, String(v)); };
  await fill('#b-inc input[data-f=v]', 3000);
  const exps = await pg.$$('#b-exp input[data-f=v]'); for (const e of exps) await e.fill('100');
  await pg.waitForTimeout(400);
  const bu = await pg.evaluate(() => { const x = budget(); return { cap: x.cap, dep: x.dep, lp: x.lp, inv: x.plan.inv, prec: x.plan.prec, marge: x.plan.marge }; });
  ok(Math.abs(bu.dep - (exps.length * 100 + bu.lp)) < 0.01 && Math.abs(bu.cap - (3000 - bu.dep)) < 0.01, 'budget : dépenses et épargne possible');
  ok(Math.abs(bu.marge + bu.prec + bu.inv - bu.cap) <= 1, 'plan mensuel complet (marge, précaution, investissement)');
  ok((await pg.textContent('#bud-plan')).includes('Combien investir'), 'plan affiché');
  /* objectifs */
  await pg.evaluate(() => go('goals')); await pg.click('[data-act=gnew][data-i="0"]'); await pg.click('[data-act=gsave]');
  ok(await pg.evaluate(() => D.goals.length === 1 && gState(D.goals[0]).need > 0), 'objectif créé avec effort mensuel');
  ok((await pg.textContent('#v-goals')).includes('Effort nécessaire'), 'carte d’objectif');
  /* assistant local : budget, crédits, objectifs */
  const rep = await pg.evaluate(() => ['combien dois-je investir chaque mois ?', 'combien il me reste à rembourser sur mon prêt ?', 'où en sont mes objectifs ?'].map(q => LAI.answer(q).t));
  ok(/Combien investir chaque mois/.test(rep[0]) && /Capital restant dû/.test(rep[1]) && /Vos objectifs|Épargne de précaution/.test(rep[2]), 'assistant : budget, crédits, objectifs');
  /* contrôle des chiffres de l'IA du Mac */
  ok(await pg.evaluate(() => unknownNums('Vous avez 120 000 € et 3 projets', ['120000']).length === 0 && unknownNums('Comptez 98 765 €', ['120000']).length === 1), 'chiffres inventés repérés');
  /* recherche rapide, bilan PDF */
  await pg.keyboard.press('Control+k'); await pg.waitForSelector('#pal.open'); await pg.waitForTimeout(80); await pg.keyboard.type('budget'); await pg.waitForTimeout(80); ok((await pg.textContent('#pal-l')).includes('Budget'), 'recherche rapide'); await pg.keyboard.press('Escape');
  const bil = await pg.evaluate(() => bilanHTML()); ok(/Bilan patrimonial/.test(bil) && /Crédits/.test(bil) && /Budget mensuel/.test(bil) && /Objectifs/.test(bil), 'bilan patrimonial complet');
  ok(!errs.length, 'aucune erreur JavaScript (nouvelles fonctions) : ' + errs.join(' | '));
  /* actualités : thème, région, doublons retirés, titres échappés */
  await pg.click('#tmore'); await pg.click('.tile[data-v=news]'); await pg.waitForSelector('#v-news .nwi', { timeout: 8000 });
  ok(await pg.locator('#v-news .nwi').count() === 4, 'actualités affichées sans doublon (' + await pg.locator('#v-news .nwi').count() + ')');
  ok(!(await pg.evaluate(() => !!document.querySelector('#v-news script'))) && (await pg.textContent('#v-news')).includes('<script>'), 'titre piégé affiché comme du texte');
  await pg.click('[data-act=nth][data-v=energie]'); await pg.click('[data-act=nrg][data-v=asie]'); await pg.waitForTimeout(400);
  const lq = decodeURIComponent(NEWSQ[NEWSQ.length - 1] || '');
  ok(/pétrole/.test(lq) && /Chine/.test(lq) && /hl=fr/.test(lq), 'requête selon le thème et la région');
  ok((await pg.textContent('#sttl')).includes('Pétrole et énergie · Asie'), 'thème et région rappelés dans le titre');
  ok(/Actualités/.test(await pg.evaluate(() => LAI.answer('quelles sont les actualités ?').t)), 'assistant : actualités');
  /* cours suivis automatiquement : ticker trouvé d'après l'ISIN, aucun essai répété pour un nom introuvable */
  const ta = await pg.evaluate(async () => { D.assets.push({ id: 'tauto', cat: 'bourse', name: 'S&P 500 EUR (Acc)', notes: 'ISIN FR0011550185', qty: 1, pru: 35.23 }, { id: 'tnon', cat: 'bourse', name: 'Valeur inconnue XYZ', qty: 2, pru: 5 }); save(); await autoTickers(); const a = D.assets.find(a => a.id === 'tauto'), n = D.assets.find(a => a.id === 'tnon'); return { tick: a.tick, auto: a.tickAuto, price: a.price, ntick: n.tick, essai: !!n.tickEssai }; });
  ok(ta.tick === 'ESE.PA' && ta.auto === true && ta.price > 0 && !ta.ntick && ta.essai, 'cours automatique : ticker trouvé par l’ISIN (place de Paris), cours récupéré ; nom introuvable noté');
  const nq = SEARCHQ.length; await pg.evaluate(() => autoTickers()); ok(SEARCHQ.length === nq, 'nom introuvable : pas de nouvelle recherche avant une semaine');
  await pg.evaluate(() => { D.assets = D.assets.filter(a => a.id !== 'tauto' && a.id !== 'tnon'); save(); render(); });
  /* version 6.3 : relevés bancaires, prévu contre réel, abonnements */
  await pg.evaluate(() => go('budget')); await pg.click('#bud-reel [data-act=opsimp]');
  const mois = await pg.evaluate(() => [4, 3, 2, 1].map(k => moisDecale(moisCourant(), -k)));
  const lignes = ['Date;Libellé;Débit euros;Crédit euros'];
  mois.forEach((m, i) => { const [y, mo] = m.split('-'); const d = j => j + '/' + mo + '/' + y;
    lignes.push(`${d('01')};VIR SALAIRE ACME;;3 000,00`, `${d('05')};PRLV SEPA NETFLIX.COM;13,49;`, `${d('08')};PRLV FREE MOBILE;19,99;`, `${d('10')};CB CARREFOUR MARKET;320,00;`, `${d('12')};CB RESTAURANT LE ZINC;${i === 3 ? '260,00' : '60,00'};`, `${d('15')};VIR LIVRET A;300,00;`, `${d('20')};CB BOUTIQUE INCONNUE;45,00;`); });
  await pg.setInputFiles('#ops-f', { name: 'releve.csv', mimeType: 'text/csv', buffer: Buffer.from(lignes.join('\r\n'), 'latin1') });
  await pg.waitForFunction(() => /opérations lues/.test((document.getElementById('ops-p') || {}).textContent || ''));
  ok(/28 opérations lues/.test(await pg.textContent('#ops-p')), 'relevé lu (encodage Windows, débit et crédit) : ' + (await pg.textContent('#ops-p')).slice(0, 80));
  await pg.click('[data-act=opsok]'); await pg.waitForTimeout(200);
  ok(await pg.evaluate(() => D.ops.length === 28 && D.ops.filter(o => o.cat === 'abonnement').length === 4 && D.ops.filter(o => o.cat === 'revenu').length === 4), 'opérations importées et classées');
  await pg.click('#bud-reel [data-act=opsimp]'); await pg.setInputFiles('#ops-f', { name: 'releve.csv', mimeType: 'text/csv', buffer: Buffer.from(lignes.join('\r\n'), 'latin1') });
  await pg.waitForFunction(() => /Déjà importé/.test((document.getElementById('ops-p') || {}).textContent || '')); ok(true, 'même relevé importé deux fois : aucun doublon'); await pg.keyboard.press('Escape');
  const reel = await pg.textContent('#bud-reel');
  ok(/Mes dépenses réelles/.test(reel) && /de plus que prévu/.test(reel) && /loisirs/.test(reel), 'prévu contre réel : dépassement en loisirs signalé');
  ok(/Netflix/i.test(await pg.textContent('#bud-abo')) && /par an/.test(await pg.textContent('#bud-abo')), 'abonnements détectés');
  ok(await pg.evaluate(() => insights().some(i => /de plus que prévu/.test(i.title))), 'dépassement du mois dernier dans les alertes');
  await pg.click('[data-act=bmois][data-k="-1"]'); ok((await pg.textContent('#bm-txt')).toLowerCase() === (await pg.evaluate(() => moisTxt(moisDecale(UI.bm, 0)))).toLowerCase(), 'navigation entre les mois');
  await pg.click('[data-act=opsvoir]'); const sel = pg.locator('#sheet select[data-ch=opcat]', { has: pg.locator('option') }).filter({ hasText: '' });
  const idInc = await pg.evaluate(() => D.ops.find(o => /INCONNUE/.test(o.lib)).id);
  await pg.selectOption(`#sheet select[data-id="${idInc}"]`, 'loisirs').catch(async () => { await pg.evaluate(id => opCat(id, 'loisirs'), idInc); });
  ok(await pg.evaluate(() => D.regles['boutique inconnue'] === 'loisirs' && D.ops.filter(o => /INCONNUE/.test(o.lib)).every(o => o.cat === 'loisirs')), 'catégorie corrigée et retenue pour le même libellé');
  await pg.keyboard.press('Escape'); await pg.click('#bud-reel [data-act=bfill]'); await pg.click('[data-act=askok]'); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => D.budget.exp.some(l => l.c === 'alimentation' && l.v === 320) && D.budget.inc[0].v === 3000 && !D.budget.exp.some(l => l.c === 'epargne')), 'budget rempli avec les moyennes réelles');
  /* rendement réel, versements datés, frais */
  const ren = await pg.evaluate(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 2); D.assets.push({ id: 'e1', cat: 'epargne', env: 'av', name: 'Assurance-vie', amount: 10000, value: 11025, date: d.toLocaleDateString('sv-SE'), fees: 0.6 }); save(); openDetail('e1'); return document.getElementById('sheet').textContent; });
  ok(/Rendement réel/.test(ren) && /5,0\s%\spar an/.test(ren.replace(/ | /g, ' ')) && /Livret A/.test(ren) && /Frais de gestion/.test(ren), 'rendement réel d’une assurance-vie (5 % par an) : ' + (/[\d,]+\s?%\spar an/.exec(ren.replace(/ | /g, ' ')) || [''])[0]);
  await pg.click('[data-act=move][data-id=e1]'); await pg.fill('#mv-m', '1000'); await pg.click('[data-act=mvsave]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => { const a = D.assets.find(x => x.id === 'e1'); return a.mv.length === 2 && a.amount === 11000 && a.value === 12025; }), 'versement daté enregistré');
  await pg.keyboard.press('Escape');
  /* devises */
  ok(await pg.evaluate(() => { const t0 = totals().tv; D.fx.USD = { r: 0.9, ts: Date.now() }; D.assets.push({ id: 'u1', cat: 'cash', name: 'Compte en dollars', amount: 1000, dev: 'USD' }); return Math.abs(totals().tv - t0 - 900) < 0.01 && /1\s000\s\$/.test(devTxt(D.assets.find(a => a.id === 'u1'), 1000).replace(/ | /g, ' ')); }), 'compte en dollars converti en euros');
  await pg.evaluate(() => { delete D.fx.USD; return fxRefresh(true); }); await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => D.fx.USD && Math.abs(D.fx.USD.r - 0.9) < 1e-9), 'taux du dollar récupéré');
  /* revenus passifs et analyse */
  await pg.evaluate(() => { const a = D.assets.find(x => x.id === 'a1'); a.div = 1; a.divm = 6; D.assets.push({ id: 'l1', cat: 'cash', name: 'Livret A', amount: 10000, rate: 2.4 }); D.assets.find(x => x.id === 'b1').rent = 700; save(); render(); go('analyse'); });
  await pg.waitForTimeout(200); const ana = await pg.textContent('#v-analyse');
  ok(/Revenus passifs/.test(ana) && /Loyers/.test(ana) && /Dividendes/.test(ana) && /Intérêts des livrets/.test(ana), 'revenus passifs : loyers, dividendes, intérêts');
  ok(await pg.evaluate(() => Math.abs(CL.revenusPassifs(sourcesPassives()).total - (700 * 12 + 10 + 240)) < 1), 'total des revenus passifs sur 12 mois');
  ok(/Rendement réel/.test(ana), 'carte rendement réel');
  await ctx.route(/range%3Dmax|range=max/, r => { const t0 = Date.now() / 1000 - 5 * 365 * 864e2; r.fulfill({ json: { chart: { result: [{ meta: { currency: 'EUR' }, timestamp: Array.from({ length: 61 }, (_, i) => Math.floor(t0 + i * 30.4 * 864e2)), indicators: { quote: [{ close: Array.from({ length: 61 }, (_, i) => 300 + i * 5) }] } }] } } }); });
  await pg.click('[data-act=perfidx]'); await pg.waitForFunction(() => /€/.test(document.getElementById('pf-idx').textContent)); ok(true, 'comparaison avec un ETF monde');
  /* simulateurs : retraite, vente, succession */
  await pg.evaluate(() => { UI.tool = 'fire'; go('tools'); renderTools(true); }); await pg.fill('#fi-age', '35'); await pg.waitForTimeout(300);
  const fo = await pg.textContent('#fi-out'); ok(/Capital à réunir/.test(fo) && /Chances/.test(fo) && /prudent/.test(fo) && await pg.locator('#fi-out svg.chart').count() === 1, 'simulation de la retraite');
  ok(await pg.evaluate(() => D.fire.age === 35), 'paramètres de la retraite gardés');
  await pg.click('[data-act=tool][data-t=vente]'); await pg.selectOption('#v-a', 'e1'); await pg.waitForTimeout(150);
  const vo = await pg.textContent('#v-out'); ok(/Vous touchez/.test(vo) && /Prélèvements sociaux/.test(vo) && await pg.inputValue('#v-t') === 'av', 'vente d’une assurance-vie : impôt calculé');
  await pg.click('[data-act=tool][data-t=succ]'); await pg.waitForTimeout(150);
  const so = await pg.textContent('#v-tools'); ok(/Droits par enfant/.test(so) && /Droits de donation/.test(so) && /fortune immobilière/.test(so), 'succession, donation et IFI');
  /* résumé du mois */
  await pg.evaluate(() => { const pm = moisDecale(moisCourant(), -1), av = moisDecale(moisCourant(), -2); D.hist = D.hist.filter(h => h.d.slice(0, 7) !== pm && h.d.slice(0, 7) !== av).concat([{ d: av + '-28', v: 100000 }, { d: pm + '-27', v: 101500 }]).sort((a, b) => a.d.localeCompare(b.d)); delete D.set.recapVu; go('home'); renderHome(); });
  const rc = await pg.textContent('#v-home'); ok(/Votre bilan de/.test(rc) && /1\s500/.test(rc.replace(/ | /g, ' ')), 'résumé du mois écoulé sur l’accueil');
  await pg.click('[data-act=recapok]'); ok(!/Votre bilan de/.test(await pg.textContent('#v-home')), 'résumé masqué après lecture');
  /* pourquoi le patrimoine a bougé : versements, marché, crédits */
  await pg.evaluate(() => { const pm = moisDecale(moisCourant(), -1), av = moisDecale(moisCourant(), -2); D.hist = D.hist.filter(h => h.d.slice(0, 7) !== pm && h.d.slice(0, 7) !== av).concat([{ d: av + '-28', v: 100000, i: 80000, k: 50000, g: { bourse: 1000 } }, { d: pm + '-27', v: 101500, i: 80500, k: 49700, g: { bourse: 1700 } }]).sort((a, b) => a.d.localeCompare(b.d)); delete D.set.recapVu; save(); go('home'); render(); });
  const rb = await pg.textContent('#v-home'); ok(/Surtout grâce à la hausse de vos placements \(\+700/.test(rb.replace(/[\u00a0\u202f]/g, ' ')) && /en particulier bourse/.test(rb) && /Voir le détail/.test(rb), 'résumé du mois : cause principale de la variation');
  await pg.click('[data-act=bougemp]'); await pg.waitForTimeout(200); const bg = (await pg.textContent('#v-analyse')).replace(/[\u00a0\u202f]/g, ' ');
  ok(/Pourquoi mon patrimoine a bougé/.test(bg) && /Vos versements et retraits\+500/.test(bg) && /Crédits remboursés\+300/.test(bg) && /Marché, intérêts et change\+700/.test(bg), 'pourquoi ça a bougé : versements, crédits, marché');
  await pg.click('[data-act=recapok]').catch(() => {}); await pg.evaluate(() => { D.set.recapVu = moisDecale(moisCourant(), -1); save(); });
  /* frais cachés : frais des contrats et frais bancaires des relevés */
  await pg.evaluate(() => { D.ops.push({ id: 'of1', d: today(), lib: 'COTISATION CARTE VISA PREMIER', m: -134, cat: 'autre' }); save(); renderAnalyse(); });
  const fr = (await pg.textContent('#v-analyse')).replace(/[\u00a0\u202f]/g, ' ');
  ok(/Frais cachés/.test(fr) && /Assurance-vie/.test(fr) && /Frais bancaires des 12 derniers mois : 134/.test(fr) && /Frais non renseignés pour « Apple »/.test(fr), 'frais cachés : contrats, frais bancaires, frais à renseigner');
  /* vente enregistrée (plus-value réalisée) puis aide à la déclaration */
  await pg.evaluate(() => openTrade('a1')); await pg.click('[data-act=seg][data-t=tm][data-v=sell]'); await pg.fill('#tq', '2'); await pg.fill('#tp', '200'); await pg.click('[data-act=tradesave]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => { const a = D.assets.find(x => x.id === 'a1'); return a.qty === 8 && a.ventes.length === 1 && a.ventes[0].pv === 100 && a.ventes[0].d === today(); }), 'vente : plus-value réalisée enregistrée');
  await pg.evaluate(() => { const Y = new Date().getFullYear() - 1, a = D.assets.find(x => x.id === 'a1'); a.ventes.push({ d: Y + '-03-01', q: 1, p: 400, pru: 150, pv: 250 }); a.env = 'cto';
    D.assets.find(x => x.id === 'b1').usage = 'loc';
    D.assets.push({ id: 'c9', cat: 'crowd', name: 'Projet test', plat: 'Bienprêter', amount: 1000, rate: 10, dur: 36, date: (Y - 1) + '-06-01', status: 'cours', paie: [{ d: Y + '-02-05', m: 30, c: 20 }, { d: Y + '-08-05', m: 40 }] },
      { id: 't9', cat: 'bourse', name: 'ETF chez Trade Republic', qty: 1, pru: 100, env: 'cto' }); save(); UI.tool = 'decl'; go('tools'); renderTools(true); });
  const dcl = (await pg.textContent('#v-tools')).replace(/[\u00a0\u202f]/g, ' ');
  ok(/Vue fiscale \d{4}/.test(dcl) && /Aide à la déclaration/.test(dcl) && /Case 2TT/.test(dcl) && /à vérifier/.test(dcl) && /72,89 €/.test(dcl) && /Case 2CK/.test(dcl) && /Case 3VG/.test(dcl) && /250,00 €/.test(dcl) && /Case 4BE/.test(dcl) && /8 400,00 €/.test(dcl) && /Case 2DC/.test(dcl), 'vue fiscale : intérêts reçus nets → brut reconstitué, acompte retenu, plus-value, loyers, dividendes et leurs cases');
  ok(/Intérêts par plateforme/.test(dcl) && /Prélèvements retenus à la source/.test(dcl) && /PFU ou barème progressif/.test(dcl) && /notice officielle/.test(dcl), 'vue fiscale : plateformes, prélèvements, comparaison PFU / barème, avertissement');
  await pg.selectOption('#v-tools [data-ch=fiscsrc]', 'brut'); await pg.waitForTimeout(100);
  ok(/50,00 €/.test((await pg.textContent('#v-tools')).replace(/[ \u202f]/g, ' ')) && await pg.evaluate(() => D.fisc.src.bienpreter === 'brut' && !srcNet('Bienprêter')), 'versements bruts : montant reçu déclaré tel quel');
  /* perte définitive d'un projet en défaut : imputée sur les intérêts de prêts participatifs (règle à vérifier) */
  await pg.evaluate(() => { const Y = new Date().getFullYear() - 1; D.assets.push({ id: 'c8', cat: 'crowd', name: 'Projet perdu', plat: 'Bienprêter', amount: 500, rate: 9, dur: 24, date: (Y - 2) + '-01-10', status: 'defaut' }); save(); renderTools(true); });
  ok(/Projet perdu/.test(await pg.textContent('#v-tools')) && /Perte définitive/.test(await pg.textContent('#v-tools')), 'projet en défaut : perte possible signalée, pas encore imputée');
  await pg.click('#v-tools [data-act=perte][data-id=c8]'); await pg.fill('#pe-m', '30'); await pg.click('[data-act=pertesave]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => { const R = declData(new Date().getFullYear() - 1); return R.imputation.perteAnnee === 30 && R.imputation.impute === 30 && R.lignes.some(l => l.cle === 'pertes' && l.certitude === 'a_verifier'); }), 'perte définitive : imputée sur les intérêts de l’année, case marquée à vérifier');
  const [dcsv] = await Promise.all([pg.waitForEvent('download'), pg.click('#v-tools [data-act=declcsv]')]); const csvF = fs.readFileSync(await dcsv.path(), 'utf8');
  ok(/^\ufeffSection;Libellé/.test(csvF) && /Déclaration;.*2TT/.test(csvF) && /PFU ou barème/.test(csvF) && /notice officielle/.test(csvF), 'export CSV de la vue fiscale');
  ok(await pg.evaluate(() => { const h = declPdfHTML(2025, declData(2025)); return /<h1>Vue fiscale 2025<\/h1>/.test(h) && /À reporter/.test(h); }), 'export PDF : document imprimable');
  await pg.click('#v-tools [data-act=decltax]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => UI.tool === 'tax' && num($('t-inc').value) > 0 && /plus avantageux/.test($('t-out').textContent)), 'comparateur : simulateur d’impôt prérempli avec les revenus de l’année');
  await pg.evaluate(() => { D.assets = D.assets.filter(a => a.id !== 'c8'); D.fisc = {}; save(); UI.tool = 'decl'; renderTools(true); });
  ok(/3916/.test(dcl) && /Trade Republic/.test(dcl) && /livrets réglementés/.test(dcl) && /assurance-vie/.test(dcl), 'déclaration : compte à l’étranger, placements sans déclaration');
  await pg.click('[data-act=declan][data-v="' + new Date().getFullYear() + '"]'); await pg.waitForTimeout(100);
  ok(/Revenus \d{4} \(en cours\)/.test(await pg.textContent('#v-tools')) && await pg.evaluate(() => declAnnee() === new Date().getFullYear() && /Case 3VG/.test(declHTML())), 'déclaration : année en cours (vente du jour)');
  ok(await pg.evaluate(() => /case 2TT, à vérifier/.test(declTexte(declData(new Date().getFullYear() - 1))) && /IFU/.test(declTexte(declData(2000)))), 'déclaration : récapitulatif à copier');
  const rep67 = await pg.evaluate(() => ['pourquoi mon patrimoine a bougé ?', 'quelle case pour mes dividendes sur la déclaration ?', 'quels sont mes frais cachés ?'].map(q => LAI.answer(q).t));
  ok(/^#### Variation du/.test(rep67[0]) && /à déclarer/.test(rep67[1]) && /case 2DC/.test(rep67[1]) && /Vos frais/.test(rep67[2]) && /Frais bancaires/.test(rep67[2]), 'assistant local : variation, déclaration, frais (' + rep67.map(t => t.slice(0, 40)).join(' | ') + ')');
  await pg.click('[data-act=declcopy]'); ok(!errs.length, 'aucune erreur JavaScript (variation, frais, déclaration) : ' + errs.join(' | '));
  /* coffre à documents */
  await pg.evaluate(() => openDetail('e1')); await pg.setInputFiles('#doc-f', { name: 'contrat.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 contrat d’essai') });
  await pg.waitForFunction(() => D.docs.length === 1);
  ok(await pg.evaluate(async () => new TextDecoder().decode(await cofLire(D.docs[0].id)) === '%PDF-1.4 contrat d’essai' && D.docs[0].aid === 'e1' && D.docs[0].k === 'web'), 'document chiffré puis relu');
  ok(await pg.evaluate(async () => { const e = await cofOp('docs', 'readonly', s => s.get(D.docs[0].id)); return !new TextDecoder().decode(e.data).includes('contrat'); }), 'document illisible sans la clé');
  ok(/Documents \(1\)/.test(await pg.textContent('#sheet')), 'document rangé dans la fiche');
  await pg.keyboard.press('Escape');
  /* l'assistant connaît les nouvelles données */
  ok(await pg.evaluate(() => { const d = dossier(); return d.depenses_reelles && d.depenses_reelles.abonnements_par_an > 0 && d.rendement_reel && d.revenus_passifs && d.revenus_passifs.a_venir_12_mois.brut > 0 && d.revenus_passifs.fiscalite_retenue_pct.pfu_impot === 12.8; }), 'dossier de l’assistant complété');
  const rep63 = await pg.evaluate(() => ['quels sont mes abonnements ?', 'à quel âge puis-je prendre ma retraite ?', 'combien me rapportent mes revenus passifs ?', 'combien dois-je investir chaque mois ?'].map(q => LAI.answer(q).t));
  ok(/Abonnements et prélèvements réguliers/.test(rep63[0]) && /Capital à réunir/.test(rep63[1]) && /Vos revenus passifs/.test(rep63[2]) && /À venir sur 12 mois/.test(rep63[2]) && /En réalité/.test(rep63[3]), 'assistant local : abonnements, retraite, revenus passifs, budget réel');
  ok(await pg.evaluate(() => { const n = D.ops.length, lib = D.ops[0].lib, P = JSON.parse(JSON.stringify(payload())); P.mt = Object.assign({}, P.mt, { ops: Date.now() + 1e6 }); const big = JSON.stringify(payload()).length; mergeRemote(P); return Array.isArray(P.ops[0]) && D.ops.length === n && D.ops[0].lib === lib.slice(0, 60) && typeof D.ops[0].m === 'number' && big < 400000; }), 'opérations synchronisées en format compact puis relues');
  /* 6.8 : tableau de bord des revenus passifs (réel contre prévu, brut et net, projection, par source, rendement, par année) */
  await pg.evaluate(() => { const d = new Date(); d.setMonth(d.getMonth() - 8); D.assets.push({ id: 'rv1', cat: 'crowd', name: 'Prêt Lyon', plat: 'Bienprêter', amount: 2000, value: 2000, rate: 9, dur: 24, date: d.toLocaleDateString('sv-SE'), status: 'cours' });
    D.rappels.push({ id: 'rrv', nom: 'Bienprêter', jour: 5, aid: 'rv1', dest: 'aucun', hist: {}, cree: '2000-01-01' }); const m = moisDecale(moisCourant(), -1), l = CL.ligneDuMois(echOf(D.assets.find(a => a.id === 'rv1')), m); rapValider('rrv', m, l.total, { d: m + '-05' }); go('rev'); });
  await pg.waitForTimeout(200); let rv = await pg.textContent('#v-rev');
  ok(/Vos revenus passifs/.test(rv) && /Reçus sur 12 mois/.test(rv) && /Projection des 12 prochains mois/.test(rv) && /Par source/.test(rv) && /Crowdlending/.test(rv) && /Rendement annualisé/.test(rv) && /Par année/.test(rv), 'écran Revenus : réel, prévu, projection, sources, rendement, années');
  ok(await pg.locator('#v-rev .rev-bars').count() === 3 && await pg.locator('#v-rev .rev-bars .pv').count() > 0, 'graphiques : barres par source et repère du prévu');
  const rbv = await pg.evaluate(() => { const R = revData(); return { reel: R.passe.total.reel, net: R.passe.total.reelNet, a: R.avenir.total.prevu }; });
  ok(rbv.reel > 0 && Math.abs(rbv.net - rbv.reel * 0.686) < 0.05 && rbv.a > 0, 'versement confirmé compté en reçu, net après PFU 31,4 % (' + JSON.stringify(rbv) + ')');
  await pg.click('#v-rev [data-act=revnet][data-v="1"]'); ok(await pg.locator('#v-rev [data-act=revnet][data-v="1"][aria-pressed=true]').count() === 1, 'bascule brut / net d’impôt');
  await pg.click('#v-rev [data-act=fisc]'); await pg.fill('#fi-ps', '17.2'); await pg.click('[data-act=fiscsave]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => D.fisc.ps === 17.2 && Math.abs(revData().passe.total.reelNet - revData().passe.total.reel * 0.7) < 0.05 && SF.includes('fisc') && payload().fisc.ps === 17.2), 'taux d’imposition modifiables, synchronisés, appliqués au net');
  await pg.click('#v-rev [data-act=fisc]'); await pg.click('[data-act=fiscdef]'); ok(await pg.evaluate(() => !Object.keys(D.fisc).length && fiscD().ps === 18.6), 'retour aux taux par défaut');
  const ya = String(new Date().getFullYear() - 1); if (await pg.locator(`#v-rev [data-act=revan][data-v="${ya}"]`).count()) { await pg.click(`#v-rev [data-act=revan][data-v="${ya}"]`); ok(/Reçu en \d{4}/.test(await pg.textContent('#v-rev')) && (await pg.evaluate(() => revData().Y)) === +ya, 'choix de l’année'); }
  ok(/Revenus passifs/.test(await pg.evaluate(() => LAI.answer('quels sont mes revenus nets d’impôt ?').t)) || /Vos revenus passifs/.test(await pg.evaluate(() => LAI.answer('quels sont mes revenus nets d’impôt ?').t)), 'assistant local : revenus nets');
  await pg.evaluate(() => { UI.revNet = false; UI.revAn = ''; D.assets = D.assets.filter(a => a.id !== 'rv1'); D.rappels = D.rappels.filter(r => r.id !== 'rrv'); save(); render(); go('home'); });
  /* 6.8 : sauvegarde complète et restauration « ajouter » : rappels, objectifs, opérations, fiscalité repris sans écraser l'existant */
  ok(await pg.evaluate(() => {
    const avant = JSON.parse(JSON.stringify(D)), b = JSON.parse(JSON.stringify(D)); b.assets = [{ id: 'zz1', cat: 'cash', name: 'Livret sauvegardé', amount: 10 }];
    b.rappels = [{ id: 'rz', nom: 'Homunity', jour: 12, hist: { '2025-01': { s: 'recu', m: 9, d: '2025-01-12' } } }]; b.goals = [{ id: 'gz', name: 'Voyage', target: 3000 }]; b.ops = [{ id: 'oz', d: '2025-01-03', lib: 'TEST', m: -5, cat: 'autre' }]; b.fisc = { tmi: 11, src: { x: 'brut' } }; delete b.sv;
    IMP.rest = b; restore('merge'); const r = D.rappels.find(x => x.id === 'rz');
        const res = D.assets.some(a => a.id === 'zz1') && r && r.hist['2025-01'].t > 0 && D.goals.some(g => g.id === 'gz') && D.ops.some(o => o.id === 'oz') && D.fisc.tmi === 11 && D.rappels.length === avant.rappels.length + 1;
    D = Object.assign(load(), avant); save(); render(); return res;
  }), 'restauration « ajouter » : placements, rappels (schéma mis à jour), objectifs, opérations et fiscalité repris');
  ok(await pg.evaluate(() => { const avant = JSON.parse(JSON.stringify(D)), R = JSON.parse(JSON.stringify(payload())); R.rappels = (R.rappels || []).concat([{ id: 'old1', nom: 'Ancien appareil', jour: 3, hist: { '2025-05': { s: 'recu', m: 4, d: '2025-05-03' } } }]); delete R.sv; R.mt = Object.assign({}, R.mt, { rappels: 1 });
    mergeRemote(R); const r = D.rappels.find(x => x.id === 'old1'), res = !!r && r.hist['2025-05'].m === 4 && D.rappels.length === avant.rappels.length + 1; D = Object.assign(load(), avant); save(); render(); return res; }), 'synchronisation avec un appareil d’avant la 6.8 : ses rappels et leur historique sont gardés');
  /* 6.8 : import depuis Finary ou un tableur (glisser-déposer, colonnes retenues, rapprochement, doublons, Excel, capture, annulation) */
  await pg.evaluate(() => { D.assets.push({ id: 'fi1', cat: 'cash', name: 'Livret A', plat: 'Boursorama', amount: 4000, value: 4000 }); save(); go('assets'); openImport(); });
  await pg.click('[data-act=imptab]'); ok(await pg.locator('#imp-dz').count() === 1 && /Aucun identifiant/.test(await pg.textContent('#sheet')), 'import Finary : zone de dépôt, sans identifiant');
  const csvFin = 'Nom;Catégorie;Établissement;Valeur actuelle;Quantité;PRU\nAmundi MSCI World;ETF;Boursorama;5 120,50 €;10;480\nLivret A;Livret;BoursoBank;4 250,00;;\nAmundi MSCI World;ETF;Boursorama;5 120,50;10;480\nProjet Lyon;Crowdlending;Bienprêter;1 000;;\n';
  await pg.evaluate(t => { const dt = new DataTransfer(); dt.items.add(new File([t], 'finary.csv', { type: 'text/csv' })); document.getElementById('imp-dz').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }, csvFin);
  await pg.waitForSelector('#ic-nom'); ok(await pg.inputValue('#ic-valeur') === '3' && await pg.inputValue('#ic-plateforme') === '2' && /5 120,50/.test((await pg.textContent('#imp-ap')).replace(/[ \u202f]/g, ' ')), 'fichier déposé : colonnes reconnues, aperçu');
  await pg.click('[data-act=imprap]'); await pg.waitForTimeout(100);
  const ir = await pg.evaluate(() => IMP.R.map(x => x.action + (x.cible ? ':' + x.cible : '') + (x.doublon ? ':doublon' : '')));
  ok(ir.join() === 'creer,maj:fi1,ignorer:doublon,creer' && /4 000,00 € → /.test((await pg.textContent('#sheet')).replace(/[ \u202f]/g, ' ')), 'rapprochement : créer, mettre à jour le Livret A (BoursoBank = Boursorama), doublon ignoré (' + ir + ')');
  await pg.selectOption('[data-ch=impact][data-i="3"]', 'ignorer'); ok(/Importer 2 lignes/.test(await pg.textContent('#imp-go')), 'choix par ligne : compteur mis à jour');
  await pg.click('#imp-go'); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => { const a = D.assets.find(x => x.name === 'Amundi MSCI World'), l = D.assets.find(x => x.id === 'fi1'); return a && a.cat === 'bourse' && a.qty === 10 && a.pru === 480 && Math.abs(a.price - 512.05) < 1e-6 && l.value === 4250 && !D.assets.some(x => x.name === 'Projet Lyon') && D.impUndo.n === 2 && Object.values(D.impMap)[0].valeur === 3; }), 'import appliqué : titre créé (quantité, PRU, cours), livret mis à jour, colonnes retenues');
  await pg.click('#toast [data-act=toastact]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => !D.assets.some(x => x.name === 'Amundi MSCI World') && D.assets.find(x => x.id === 'fi1').value === 4000 && !D.impUndo), 'annulation de l’import : tout revient comme avant');
  /* fichier Excel (.xlsx) */
  const xlsx = await pg.evaluate(async () => {
    const enc = new TextEncoder(), F = { 'xl/workbook.xml': '<workbook><sheets><sheet name="A" sheetId="1" r:id="rId1"/></sheets></workbook>', 'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>', 'xl/sharedStrings.xml': '<sst><si><t>Asset</t></si><si><t>Balance</t></si><si><t>SCPI Corum</t></si></sst>', 'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>3000</v></c></row></sheetData></worksheet>' };
    const parts = [], cen = []; let off = 0; const u16 = n => [n & 255, n >> 8], u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24];
    for (const [nom, t] of Object.entries(F)) { const n = enc.encode(nom), d = enc.encode(t); parts.push(new Uint8Array([...u32(0x04034b50), ...u16(20), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(d.length), ...u32(d.length), ...u16(n.length), 0, 0]), n, d);
      cen.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(d.length), ...u32(d.length), ...u16(n.length), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ...u32(off)]), n); off += 30 + n.length + d.length; }
    const cl = cen.reduce((s, x) => s + x.length, 0); parts.push(...cen, new Uint8Array([...u32(0x06054b50), 0, 0, 0, 0, ...u16(4), ...u16(4), ...u32(cl), ...u32(off), 0, 0]));
    openImpTab(); await impLire(new File(parts, 'export.xlsx')); return { val: $('ic-valeur') && $('ic-valeur').value, ap: $('imp-ap').textContent };
  });
  ok(xlsx.val === '1' && /SCPI Corum/.test(xlsx.ap) && /Immobilier fractionné/.test(xlsx.ap), 'fichier Excel lu : colonnes et type (SCPI → immobilier fractionné)');
  /* capture d'écran lue par Gemini (réponse simulée), même écran de vérification */
  const cap = await pg.evaluate(async () => { localStorage.setItem('pat_ai_key', 'AIza' + 'x'.repeat(35)); const g0 = window.gem; window.gem = async () => 'Voici : [{"nom":"Bitcoin","type":"Crypto","plateforme":"Coinbase","valeur":"1 500 €","quantite":"0,02"}]';
    openImpTab(); await impLire(new File([new Uint8Array([137, 80, 78, 71])], 'capture.png', { type: 'image/png' })); window.gem = g0; localStorage.removeItem('pat_ai_key'); return { R: IMP.R && IMP.R.map(x => x.nom + ':' + x.action + ':' + x.cat + ':' + x.valeur), t: $('sheet').textContent }; });
  ok(cap.R && cap.R[0] === 'Bitcoin:maj:autre:1500' && /vérifiez chaque nom/.test(cap.t) && /6 000,00 € → 1 500,00 €/.test(cap.t.replace(/[\u00a0\u202f]/g, ' ')), 'capture d’écran : lignes lues par l’IA, rapprochées du Bitcoin existant, vérification avant import');
  ok(/Finary/.test(await pg.evaluate(() => LAI.answer('comment importer depuis Finary ?').t)), 'assistant local : import Finary');
  await pg.evaluate(() => { closeM(); D.assets = D.assets.filter(a => a.id !== 'fi1'); D.impMap = {}; save(); render(); go('home'); });
  ok(!errs.length, 'aucune erreur JavaScript (version 6.3) : ' + errs.join(' | '));
  /* application Mac (pont simulé) : verrouillage Touch ID, délai réglable, montant masqué dans la barre des menus */
  { const pm = await ctx.newPage(); const errsMac = []; pm.on('pageerror', e => errsMac.push(e.message));
    await pm.addInitScript(() => {
      const d = JSON.parse(localStorage.getItem('pat_data')); d.set = Object.assign({}, d.set, { lock: true, bar: true, barMode: 'net' }); localStorage.setItem('pat_data', JSON.stringify(d));
      window.__barre = []; window.__touch = false; const r = v => () => Promise.resolve(v);
      window.__sur = { pat_ai_key: 'cle-gemini-deja-chiffree' }; localStorage.setItem('pat_xai_key', 'cle-xai-en-clair');
      window.patrimoineMac = { stockageSur: { tout: () => window.__sur, ecrire: (k, v) => { if (v == null) delete window.__sur[k]; else window.__sur[k] = v; return true; } }, ia: { etat: r({ installee: false }), installer: r({}), ecrire: r('') }, dictee: { etat: r({}), micro: r(false), installer: r({}), ecouter: r('') },
        maj: { etat: r({ etat: 'a-jour', version: '9.9.9' }), verifier: r({}), installer: r(false), surChangement: () => {} },
        sauvegarder: r({ n: 1 }), etatSauvegardes: r({ n: 0 }), sauvegardes: r([]), lireSauvegarde: r('{}'), ouvrirSauvegardes: r(''),
        touchDispo: r(true), touchID: () => Promise.resolve(window.__touch), notifier: r(true), pdf: r({ ok: true }), barre: t => { window.__barre.push(t); return Promise.resolve(true); },
        badge: n => { window.__badge = n; return Promise.resolve(n); }, captures: a => { if (typeof a === 'boolean') window.__capt = a; return Promise.resolve({ protegee: window.__capt !== true }); }, demarrage: a => { if (typeof a === 'boolean') window.__login = a; return Promise.resolve(!!window.__login); },
        cleCoffre: r('x'.repeat(44)), ouvrirDocument: r({ ok: true }), connexionGoogle: r({}), surVerrou: cb => { window.__verrou = cb; }, surCommande: () => {} };
    });
    await pm.goto(base); await pm.waitForTimeout(1200);
    ok(await pm.evaluate(() => document.body.classList.contains('locked')), 'Mac : verrouillé au lancement');
    const sur = await pm.evaluate(() => ({ cles: Object.keys(localStorage), data: !!window.__sur.pat_data && JSON.parse(window.__sur.pat_data).assets.length, xai: window.__sur.pat_xai_key, lu: localStorage.getItem('pat_ai_key'), actifs: D.assets.length }));
    ok(!sur.cles.includes('pat_data') && !sur.cles.includes('pat_xai_key') && sur.data === 3 && sur.xai === 'cle-xai-en-clair' && sur.lu === 'cle-gemini-deja-chiffree' && sur.actifs === 3, 'Mac : patrimoine et clés confiés au stockage chiffré, plus rien en clair (' + JSON.stringify(sur) + ')');
    ok(await pm.evaluate(() => window.__barre.length > 0 && window.__barre.every(t => !/\d/.test(t))), 'Mac : aucun montant dans la barre des menus tant que l’application est verrouillée : ' + await pm.evaluate(() => JSON.stringify(window.__barre)));
    await pm.evaluate(() => { window.__touch = true; }); await pm.click('#unl'); await pm.waitForTimeout(300);
    ok(await pm.evaluate(() => !document.body.classList.contains('locked') && /\d/.test(window.__barre[window.__barre.length - 1])), 'Mac : Touch ID déverrouille, le patrimoine revient dans la barre des menus');
    await pm.evaluate(() => { window.__verrou(); }); await pm.waitForTimeout(100);
    ok(await pm.evaluate(() => document.body.classList.contains('locked') && !/\d/.test(window.__barre[window.__barre.length - 1])), 'Mac : mise en veille → verrouillé, montant masqué');
    await pm.evaluate(() => { document.body.classList.remove('locked'); go('set'); }); await pm.waitForTimeout(300);
    await pm.click('[data-act="lockm"][data-v="15"]'); await pm.waitForTimeout(100);
    ok(await pm.evaluate(() => D.set.lockMin === 15 && lockMin() === 15 && /après 15 minutes/.test(document.body.textContent)), 'Mac : délai de verrouillage réglable (15 min)');
    await pm.click('[data-act="tog"][data-k="login"]'); await pm.waitForTimeout(150);
    ok(await pm.evaluate(() => window.__login === true && MACST.login === true && document.querySelector('[data-k="login"]').getAttribute('aria-checked') === 'true'), 'Mac : ouverture à l’ouverture de session activée');
    const nb = await pm.evaluate(() => { D.rappels = [{ id: 'r1', nom: 'Bricks', jour: 8, montant: 10, actif: true, debut: '2026-01' }]; render(); return { badge: window.__badge, dus: rapDus().length }; });
    ok(nb.dus > 0 && nb.badge === nb.dus, 'Mac : pastille du Dock = paiements à confirmer (' + JSON.stringify(nb) + ')');
    const csv = await pm.evaluate(() => { let t = ''; const d0 = window.dl; window.dl = (n, c) => { t = c; }; D.assets.push({ id: 'z9', cat: 'autre', name: '=HYPERLINK("http://x")', amount: -5 }); expCSV(); window.dl = d0; D.assets.pop(); return t; });
    ok(/'=HYPERLINK/.test(csv) && /;-5;/.test(csv), 'export CSV : formule neutralisée, nombre négatif gardé');
    ok(await pm.evaluate(() => { const n = window.__ws.length; window.patCmd('reveil'); return window.__ws.length >= n; }), 'Mac : réveil du Mac → flux et rappels relancés sans erreur');
    await pm.evaluate(() => { closeM(); go('set'); }); await pm.waitForTimeout(200);
    ok(await pm.evaluate(() => document.querySelector('[data-k="capt"]').getAttribute('aria-checked') === 'true'), 'Mac : fenêtre invisible aux captures par défaut');
    await pm.click('[data-act="tog"][data-k="capt"]'); await pm.waitForTimeout(150);
    ok(await pm.evaluate(() => window.__capt === true && MACST.protegee === false), 'Mac : captures autorisées sur demande');
    // sauvegarde exportée : chiffrée par défaut, mot de passe faible refusé, relue avec le bon mot de passe seulement
    const ex = await pm.evaluate(async () => {
      let t = ''; const d0 = window.dl; window.dl = (n, c) => { t = c; };
      exp(); $('ex-p').value = $('ex-p2').value = 'azerty123'; await expChif(); const faible = t;
      $('ex-p').value = $('ex-p2').value = 'le chat dort sur le toit'; await expChif(); window.dl = d0;
      const o = JSON.parse(t); let mauvais = '';
      try { await unsealExport(o, 'autre phrase longue ici'); } catch (e) { mauvais = e.message; }
      const lu = await unsealExport(o, 'le chat dort sur le toit');
      return { faible, clair: /Livret A|assets/.test(t), it: o.it, mauvais, n: lu.assets.length, attendu: D.assets.length };
    });
    ok(!ex.faible && !ex.clair && ex.it === 600000 && /incorrect/.test(ex.mauvais) && ex.n === ex.attendu, 'sauvegarde exportée chiffrée, illisible sans le bon mot de passe (' + JSON.stringify(ex) + ')');
    ok(await pm.evaluate(() => !!forcePhrase('Patrimoine123') && !!forcePhrase('aaaaaaaaaaaaaa') && !forcePhrase('mon vélo bleu de 2019')), 'phrase secrète : courte, courante ou répétitive refusée');
    ok(!errsMac.length, 'Mac : aucune erreur JavaScript : ' + errsMac.join(' | '));
    await pm.close(); }
  /* bureau */
  await pg.setViewportSize({ width: 1280, height: 800 }); await pg.click('.side [data-nav=mk]'); await pg.waitForTimeout(300);
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'bureau.png') });
  console.log('scénario navigateur :', n, 'contrôles réussis'); await b.close(); srv.close();
})().catch(async e => { console.error('ÉCHEC :', e.message); process.exit(1); });
