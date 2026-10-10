/* Patrimoine AI — moteur de cours en direct (produit par QuenTools).
   Deux flux continus (WebSocket) : Binance pour les cryptomonnaies (temps réel), Yahoo Finance pour le reste
   (actions, ETF, indices, devises, matières premières ; temps réel ou différé selon la place de cotation).
   Si un flux est coupé ou muet, une interrogation rapide prend le relais. Aucune clé, aucun serveur. */
(function (root) {
  'use strict';

  /* ---------- Décodage du message Yahoo (protobuf, sans bibliothèque) ---------- */
  function readVarint(b, o) {
    let r = 0, m = 1, x;
    do { x = b[o.i++]; r += (x & 0x7f) * m; m *= 128; } while (x & 0x80 && o.i < b.length);
    return r;
  }
  const zig = n => (n % 2 ? -(n + 1) / 2 : n / 2);
  function f32(b, i) { return new DataView(b.buffer, b.byteOffset + i, 4).getFloat32(0, true); }
  function decodePricing(b) {
    const o = { i: 0 }, d = {}, dec = new TextDecoder();
    while (o.i < b.length) {
      const k = readVarint(b, o), f = Math.floor(k / 8), w = k & 7;
      if (w === 0) { const v = readVarint(b, o); if (f === 3) d.time = zig(v); else if (f === 6) d.quoteType = v; else if (f === 7) d.marketHours = v; else if (f === 9) d.volume = zig(v); }
      else if (w === 2) { const n = readVarint(b, o), s = b.subarray(o.i, o.i + n); o.i += n; if (f === 1) d.id = dec.decode(s); else if (f === 4) d.currency = dec.decode(s); else if (f === 5) d.exchange = dec.decode(s); else if (f === 13) d.shortName = dec.decode(s); }
      else if (w === 5) { const v = f32(b, o.i); o.i += 4; if (f === 2) d.price = v; else if (f === 8) d.changePercent = v; else if (f === 10) d.dayHigh = v; else if (f === 11) d.dayLow = v; else if (f === 12) d.change = v; else if (f === 15) d.open = v; else if (f === 16) d.previousClose = v; }
      else if (w === 1) o.i += 8;
      else break;
    }
    return d;
  }
  function fromB64(s) {
    if (typeof atob === 'function') return Uint8Array.from(atob(s), c => c.charCodeAt(0));
    return new Uint8Array(Buffer.from(s, 'base64'));
  }
  /* Message {"type":"pricing","message":"<base64>"} → cotation normalisée, ou null. */
  function parseYahoo(raw) {
    let j; try { j = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!j || !j.message) return null;
    let d; try { d = decodePricing(fromB64(j.message)); } catch (e) { return null; }
    if (!d.id || !(d.price > 0)) return null;
    let p = d.price, pc = d.previousClose > 0 ? d.previousClose : null, c = d.currency || '';
    if (c === 'GBp' || c === 'GBX') { p /= 100; if (pc) pc /= 100; c = 'GBP'; }
    if (c === 'ZAc') { p /= 100; if (pc) pc /= 100; c = 'ZAR'; }
    return { s: d.id, p, pc, c, t: d.time > 1e12 ? d.time : d.time * 1000 || null, mh: d.marketHours, n: d.shortName || '', ex: d.exchange || '', dh: d.dayHigh > 0 ? d.dayHigh : null, dl: d.dayLow > 0 ? d.dayLow : null, o: d.open > 0 ? d.open : null };
  }

  /* ---------- Correspondance des symboles ---------- */
  /* BTC-EUR → btceur ; BTC-USD → btcusdt. Seules les paires réellement cotées sur Binance sont acceptées. */
  const BINANCE_OK = new Set('BTC ETH BNB SOL XRP ADA DOGE AVAX DOT LINK LTC TRX MATIC POL ATOM XLM BCH UNI NEAR SHIB PEPE ARB OP APT SUI INJ AAVE FIL ETC HBAR TON'.split(' '));
  function toBinance(sym) {
    const m = /^([A-Z0-9]{2,6})-(EUR|USD)$/.exec(String(sym || '').toUpperCase());
    if (!m || !BINANCE_OK.has(m[1])) return null;
    return (m[1] + (m[2] === 'EUR' ? 'EUR' : 'USDT')).toLowerCase();
  }
  const isCrypto = sym => /^[A-Z0-9]{2,6}-(EUR|USD)$/.test(String(sym || '').toUpperCase());

  /* ---------- Le flux ---------- */
  function createFeed(opt) {
    opt = opt || {};
    const WS = opt.WebSocket || root.WebSocket, now = opt.now || Date.now;
    const poll = opt.poll || null;               // async (symboles) → { SYMBOLE: {p, pc, c, t} }
    const setT = opt.setTimeout || setTimeout, clrT = opt.clearTimeout || clearTimeout;
    const quiet = opt.quietMs || 25000;          // sans nouvelle d'un symbole : interrogation de secours
    const pollEvery = opt.pollMs || 12000;
    const Q = {}, want = new Map(), own = new Map();
    const st = { yahoo: 'off', binance: 'off', polling: false };
    let timer = 0, tickQ = null;

    function emitStatus() { (opt.onStatus || (() => {}))(status()); }
    function status() {
      const ts = Object.values(Q).map(q => q.rx || 0), last = ts.length ? Math.max.apply(null, ts) : 0;
      const open = st.yahoo === 'open' || st.binance === 'open';
      return { yahoo: st.yahoo, binance: st.binance, polling: st.polling, last, mode: open ? 'direct' : st.polling ? 'rapide' : 'off' };
    }
    function put(q, src) {
      const prev = Q[q.s], t = now();
      const cur = Q[q.s] = Object.assign({}, prev || {}, q, { src, rx: t, dir: prev && prev.p !== q.p ? (q.p > prev.p ? 1 : -1) : 0, prevP: prev ? prev.p : null });
      if (!cur.pc && prev && prev.pc) cur.pc = prev.pc;
      cur.ch = cur.pc ? (cur.p / cur.pc - 1) * 100 : (q.ch != null ? q.ch : null);
      /* petite mémoire des derniers cours pour la mini-courbe : un point au plus toutes les 4 s */
      const h = cur.h = (prev && prev.h) || [];
      if (!h.length || t - h[h.length - 1][0] >= 4000) h.push([t, cur.p]); else h[h.length - 1][1] = cur.p;
      if (h.length > 90) h.shift();
      if (cur.dir !== 0 || !prev) { if (!tickQ) { tickQ = new Set(); (opt.schedule || (f => setT(f, 0)))(flush); } tickQ.add(q.s); }
      return cur;
    }
    function flush() { const L = tickQ ? [...tickQ] : []; tickQ = null; if (L.length && opt.onTick) opt.onTick(L, Q); }

    /* --- Binance --- */
    let bws = null, bTry = 0, bTimer = 0, bId = 1;
    const bMap = () => { const m = new Map(); want.forEach((_, s) => { const b = toBinance(s); if (b) m.set(b.toUpperCase(), s); }); return m; };
    function bConnect() {
      if (!WS || bws || !bMap().size) return;
      let w; try { w = new WS('wss://stream.binance.com:9443/stream'); } catch (e) { return bRetry(); }
      bws = w; st.binance = 'connecting'; emitStatus();
      w.onopen = () => { bTry = 0; st.binance = 'open'; emitStatus(); const p = [...bMap().keys()].map(k => k.toLowerCase() + '@ticker'); if (p.length) w.send(JSON.stringify({ method: 'SUBSCRIBE', params: p, id: bId++ })); };
      w.onmessage = ev => {
        let j; try { j = JSON.parse(ev.data); } catch (e) { return; }
        const d = j && (j.data || j); if (!d || !d.s || !d.c) return;
        const sym = bMap().get(d.s); if (!sym) return;
        const p = parseFloat(d.c), o = parseFloat(d.o), eur = /EUR$/.test(d.s);
        if (!(p > 0)) return;
        put({ s: sym, p, pc: o > 0 ? o : null, c: eur ? 'EUR' : 'USD', t: d.E || now(), mh: 1, ex: 'Binance', dh: parseFloat(d.h) || null, dl: parseFloat(d.l) || null }, 'direct');
      };
      w.onclose = w.onerror = () => { if (bws !== w) return; bws = null; st.binance = 'off'; emitStatus(); bRetry(); };
    }
    function bRetry() { clrT(bTimer); if (!bMap().size) return; bTimer = setT(bConnect, Math.min(30000, 1000 * Math.pow(2, bTry++))); }
    function bSync(added) {
      if (bws && st.binance === 'open') { const p = added.map(toBinance).filter(Boolean).map(b => b + '@ticker'); if (p.length) bws.send(JSON.stringify({ method: 'SUBSCRIBE', params: p, id: bId++ })); }
      else bConnect();
    }

    /* --- Yahoo --- */
    let yws = null, yTry = 0, yTimer = 0, yBeat = 0;
    const yList = () => [...want.keys()].filter(s => !toBinance(s));
    function ySend() { if (yws && st.yahoo === 'open') { const L = yList(); if (L.length) yws.send(JSON.stringify({ subscribe: L })); } }
    function yConnect() {
      if (!WS || yws || !yList().length) return;
      let w; try { w = new WS('wss://streamer.finance.yahoo.com/?version=2'); } catch (e) { return yRetry(); }
      yws = w; st.yahoo = 'connecting'; emitStatus();
      w.onopen = () => { yTry = 0; st.yahoo = 'open'; emitStatus(); ySend(); clrT(yBeat); const beat = () => { ySend(); yBeat = setT(beat, 25000); }; yBeat = setT(beat, 25000); };
      w.onmessage = ev => { const q = parseYahoo(ev.data); if (q && want.has(q.s)) put(q, 'direct'); };
      w.onclose = w.onerror = () => { if (yws !== w) return; yws = null; st.yahoo = 'off'; clrT(yBeat); emitStatus(); yRetry(); };
    }
    function yRetry() { clrT(yTimer); if (!yList().length) return; yTimer = setT(yConnect, Math.min(30000, 1000 * Math.pow(2, yTry++))); }

    /* --- Interrogation de secours : seulement pour les symboles muets --- */
    let polling = false;
    async function pollNow() {
      if (!poll || polling) return; polling = true;
      try {
        const t = now(), mute = [...want.keys()].filter(s => !Q[s] || t - (Q[s].rx || 0) > quiet).slice(0, 40);
        st.polling = mute.length > 0; if (!mute.length) { emitStatus(); return; }
        const r = await poll(mute);
        Object.keys(r || {}).forEach(s => { const q = r[s]; if (q && q.p > 0) put(Object.assign({ s }, q), 'rapide'); });
        emitStatus();
      } catch (e) { /* silencieux : le prochain tour réessaie */ } finally { polling = false; }
    }
    function loop() { pollNow(); timer = setT(loop, pollEvery); }

    return {
      Q, status,
      /* Suivre des symboles (liste complète pour ce propriétaire ; les autres propriétaires restent suivis). */
      watch(owner, symbols) {
        const list = new Set((symbols || []).map(s => String(s).toUpperCase()).filter(Boolean));
        own.set(owner, list);
        const all = new Map(); own.forEach(set => set.forEach(s => all.set(s, 1)));
        const added = [...all.keys()].filter(s => !want.has(s));
        want.clear(); all.forEach((_, s) => want.set(s, 1));
        if (added.length) { bSync(added); if (added.some(s => !toBinance(s))) { if (yws && st.yahoo === 'open') ySend(); else yConnect(); } }
        if (!timer) loop(); else if (added.length) pollNow();
        return want.size;
      },
      get(s) { return Q[String(s).toUpperCase()] || null; },
      close() { const b = bws, y = yws; bws = yws = null; clrT(timer); clrT(bTimer); clrT(yTimer); clrT(yBeat); timer = 0; want.clear(); own.clear(); [b, y].forEach(w => { if (w) { w.onclose = w.onerror = null; try { w.close(); } catch (e) {} } }); st.yahoo = st.binance = 'off'; },
      /* Pour les tests */
      _put: put, _poll: pollNow
    };
  }
  /* ---------- Statut du marché, texte clair ---------- */
  function statusLabel(q, nowMs) {
    if (!q) return { k: 'off', t: 'Hors ligne' };
    const age = (nowMs || Date.now()) - (q.t || 0);
    if (q.ex === 'Binance') return { k: 'live', t: 'Temps réel' };
    if (q.mh === 1 || q.mh === undefined) {
      if (q.t && age > 6 * 60e3) return { k: 'delay', t: 'Différé de ' + Math.round(age / 60e3) + ' min' };
      return { k: 'live', t: 'Temps réel' };
    }
    return { k: 'closed', t: q.mh === 0 ? 'Avant l’ouverture' : q.mh === 2 ? 'Après la clôture' : 'Marché fermé' };
  }

  const API = { parseYahoo, decodePricing, toBinance, isCrypto, statusLabel, createFeed };
  root.Marches = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
