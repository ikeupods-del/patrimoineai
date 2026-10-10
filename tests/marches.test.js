// Contrôle du moteur de cours en direct : node tests/marches.test.js
const M = require('../marches.js'); const assert = require('assert'); let n = 0; const ok = (c, m) => { assert(c, m); n++; };
/* encodage protobuf minimal (même format que le flux Yahoo) */
const vi = x => { const o = []; while (x > 127) { o.push((x % 128) | 128); x = Math.floor(x / 128); } o.push(x); return o; };
const str = (f, s) => { const b = [...Buffer.from(s)]; return [...vi(f * 8 + 2), ...vi(b.length), ...b]; };
const flt = (f, v) => { const b = Buffer.alloc(4); b.writeFloatLE(v); return [...vi(f * 8 + 5), ...b]; };
const sint = (f, v) => [...vi(f * 8), ...vi(v * 2)];
const yahoo = o => JSON.stringify({ type: 'pricing', message: Buffer.from([...str(1, o.id), ...flt(2, o.price), ...sint(3, o.time), ...str(4, o.cur), ...str(5, o.ex || 'NMS'), ...vi(7 * 8), ...vi(o.mh ?? 1), ...flt(16, o.pc), ...str(13, o.name || '')]).toString('base64') });

const q = M.parseYahoo(yahoo({ id: 'AAPL', price: 189.25, time: 1700000000, cur: 'USD', pc: 187.5, name: 'Apple' }));
ok(q && q.s === 'AAPL' && Math.abs(q.p - 189.25) < 1e-3 && q.c === 'USD' && Math.abs(q.pc - 187.5) < 1e-3 && q.t === 1700000000000 && q.n === 'Apple', 'décodage Yahoo');
const g = M.parseYahoo(yahoo({ id: 'SHEL.L', price: 2600, time: 1700000000, cur: 'GBp', pc: 2580 }));
ok(g.c === 'GBP' && Math.abs(g.p - 26) < 1e-3, 'pence → livres');
ok(M.parseYahoo('pas du json') === null && M.parseYahoo('{"type":"pricing"}') === null && M.parseYahoo({ message: 'AAAA' }) === null, 'messages invalides ignorés');
ok(M.toBinance('BTC-EUR') === 'btceur' && M.toBinance('ETH-USD') === 'ethusdt' && M.toBinance('AAPL') === null && M.toBinance('XYZ-EUR') === null && M.toBinance('^FCHI') === null, 'symboles Binance');
ok(M.statusLabel({ ex: 'Binance', t: 1 }).k === 'live', 'crypto = temps réel');
const nw = Date.now();
ok(M.statusLabel({ mh: 1, t: nw - 15 * 60e3 }, nw).k === 'delay' && M.statusLabel({ mh: 1, t: nw - 1000 }, nw).k === 'live' && M.statusLabel({ mh: 2, t: nw }, nw).k === 'closed' && M.statusLabel(null).k === 'off', 'libellés de statut');

/* faux WebSocket pilotable */
const socks = []; class FWS { constructor(u) { this.url = u; this.sent = []; socks.push(this); setTimeout(() => this.onopen && this.onopen(), 0); } send(m) { this.sent.push(JSON.parse(m)); } close() { this.onclose && this.onclose(); } }
const tick = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const ticks = [], polled = []; let t0 = Date.now(); let clock = () => t0;
  const feed = M.createFeed({ WebSocket: FWS, now: () => clock(), quietMs: 50, pollMs: 40, onTick: L => ticks.push(...L), poll: async S => { polled.push(S.slice()); const r = {}; S.forEach(s => { r[s] = { p: 10 + polled.length, pc: 10, c: 'EUR', t: clock() }; }); return r; }, schedule: f => setTimeout(f, 0) });
  feed.watch('home', ['AAPL', 'BTC-EUR', 'MC.PA']);
  await tick(10);
  const y = socks.find(s => /yahoo/.test(s.url)), b = socks.find(s => /binance/.test(s.url));
  ok(y && b, 'deux flux ouverts');
  ok(JSON.stringify(y.sent[0]) === JSON.stringify({ subscribe: ['AAPL', 'MC.PA'] }), 'abonnement Yahoo sans crypto');
  ok(b.sent[0].method === 'SUBSCRIBE' && b.sent[0].params[0] === 'btceur@ticker', 'abonnement Binance');
  y.onmessage({ data: yahoo({ id: 'AAPL', price: 190, time: Math.floor(Date.now() / 1000), cur: 'USD', pc: 188 }) });
  b.onmessage({ data: JSON.stringify({ stream: 'btceur@ticker', data: { s: 'BTCEUR', c: '60100.5', o: '59000', E: Date.now() } }) });
  await tick(5);
  const a = feed.get('AAPL'), c = feed.get('btc-eur');
  ok(a && Math.abs(a.p - 190) < 1e-3 && Math.abs(a.ch - (190 / 188 - 1) * 100) < 0.01, 'AAPL en direct, variation calculée');
  ok(c && c.p === 60100.5 && c.c === 'EUR' && c.src === 'direct', 'BTC en direct');
  ok(ticks.includes('AAPL') && ticks.includes('BTC-EUR'), 'événements émis');
  y.onmessage({ data: yahoo({ id: 'AAPL', price: 191, time: Math.floor(Date.now() / 1000), cur: 'USD', pc: 188 }) });
  await tick(5);
  ok(feed.get('AAPL').dir === 1 && feed.get('AAPL').prevP > 189.9, 'sens de variation (hausse)');
  ok(feed.get('AAPL').h.length >= 1, 'mini-historique');
  y.onmessage({ data: yahoo({ id: 'ZZZ', price: 5, time: 1, cur: 'USD', pc: 5 }) }); ok(!feed.get('ZZZ'), 'symbole non suivi ignoré');
  /* MC.PA reste muet : l'interrogation de secours le prend, pas AAPL */
  clock = () => t0 + 1000; await tick(120);
  ok(polled.some(L => L.includes('MC.PA')), 'secours sur le symbole muet');
  ok(feed.get('MC.PA') && feed.get('MC.PA').src === 'rapide', 'cours de secours enregistré');
  /* ajout d'un symbole : envoyé sur le flux déjà ouvert */
  feed.watch('mk', ['ETH-EUR', 'MSFT']); await tick(5);
  ok(b.sent.some(m => m.params && m.params.includes('etheur@ticker')) && y.sent.some(m => m.subscribe && m.subscribe.includes('MSFT')), 'abonnement dynamique');
  feed.watch('mk', []); ok(feed.watch('home', ['AAPL']) >= 1, 'retrait par propriétaire');
  /* coupure → reconnexion */
  const before = socks.length; y.close(); await tick(1300); ok(socks.length > before, 'reconnexion après coupure');
  feed.close();
  console.log('moteur de cours :', n, 'contrôles réussis');
})().catch(e => { console.error('ÉCHEC', e.message); process.exit(1); });
