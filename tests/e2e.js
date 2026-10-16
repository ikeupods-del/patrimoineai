// Scénario navigateur : cours en direct (faux flux), accueil, écran Marchés, fiche d'une valeur.
// node tests/e2e.js [--photos dossier]   (Chromium de /opt/pw-browsers, serveur local)
const { chromium } = require(process.env.PW || '/opt/node-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..'), SHOTS = process.argv.includes('--photos') ? process.argv[process.argv.indexOf('--photos') + 1] : null;
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
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
  const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await ctx.route(/corsproxy\.io|allorigins\.win/, r => {
    const u = decodeURIComponent(r.request().url().replace(/^.*?(url=)/, '')), m = /symbols=([^&]+)/.exec(u), c = /chart\/([^?]+)\?range=(\w+)/.exec(u);
    if (m) return r.fulfill({ json: { spark: { result: decodeURIComponent(m[1]).split(',').map(s => ({ symbol: s, response: [{ meta: { regularMarketPrice: (PRICE[s] || [10, 10, 'EUR'])[0], chartPreviousClose: (PRICE[s] || [10, 10, 'EUR'])[1], currency: (PRICE[s] || [10, 10, 'EUR'])[2] } }] })) } } });
    if (c) { const s = decodeURIComponent(c[1]), p = (PRICE[s] || [10])[0], t0 = Math.floor(Date.now() / 1000) - 300 * 60; return r.fulfill({ json: { chart: { result: [{ meta: { currency: (PRICE[s] || [0, 0, 'EUR'])[2] }, timestamp: Array.from({ length: 60 }, (_, i) => t0 + i * 300), indicators: { quote: [{ close: Array.from({ length: 60 }, (_, i) => p * (0.99 + 0.01 * Math.sin(i / 6) + i * 0.0002)) }] } }] } } }); }
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
  ok((await pg.textContent('#h-lab')) === 'Patrimoine net', 'accueil en patrimoine net');
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
  /* bureau */
  await pg.setViewportSize({ width: 1280, height: 800 }); await pg.click('.side [data-nav=mk]'); await pg.waitForTimeout(300);
  if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'bureau.png') });
  console.log('scénario navigateur :', n, 'contrôles réussis'); await b.close(); srv.close();
})().catch(async e => { console.error('ÉCHEC :', e.message); process.exit(1); });
