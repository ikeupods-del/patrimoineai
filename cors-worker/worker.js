// Relais CORS facultatif pour Patrimoine AI (produit par QuenTools) — Cloudflare Workers, offre gratuite.
// Ne relaie que Yahoo Finance. Variable facultative : ALLOWED_ORIGIN (ex. https://ikeupods-del.github.io).
const HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', 'vary': 'origin' };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const target = new URL(req.url).searchParams.get('url');
    let t; try { t = new URL(target); } catch (e) { return new Response('url manquante', { status: 400, headers: cors }); }
    if (t.protocol !== 'https:' || !HOSTS.includes(t.hostname)) return new Response('hôte non autorisé', { status: 403, headers: cors });
    const r = await fetch(t.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0 Safari/537.36', accept: 'application/json' }, cf: { cacheTtl: 120, cacheEverything: true } });
    return new Response(r.body, { status: r.status, headers: { ...cors, 'content-type': r.headers.get('content-type') || 'application/json', 'cache-control': 'public, max-age=120' } });
  }
};
