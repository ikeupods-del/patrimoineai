// Liaison bancaire dans l'application Mac, sans serveur : les fonctions de banque/routes (Enable Banking, open banking DSP2)
// tournent ici, appelées par la page à l'adresse app://patrimoine/api/banque/… .
// - La clé de l'application Enable Banking (fichier .pem choisi par l'utilisateur) est chiffrée par le trousseau du Mac (safeStorage).
// - La session bancaire est gardée sur ce Mac, chiffrée deux fois (AES-256-GCM du module, puis trousseau) ; jamais dans le dépôt ni en ligne.
// - Retour de la banque : l'adresse déclarée chez Enable Banking est la page en ligne de l'application ; elle renvoie aussitôt vers
//   http://127.0.0.1:<port>/banque, où cette application attend (port écrit au début du « state » : mac<port>-…).
'use strict';
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const RETOUR = 'https://ikeupods-del.github.io/patrimoineai/';
const ROUTES = ['etat', 'demarrer', 'retour', 'comptes', 'operations', 'deconnecter', 'diagnostic'];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// dossier : données de l'application ; racine : dossier des fichiers banque/ ; coffre : { chiffrer(texte) → Buffer, dechiffrer(Buffer) → texte }
// empreintes : fichier { "chemin relatif": sha256 } écrit à la construction (mac/scripts/copier-app.js), gardé dans l'archive signée ;
// chaque fichier de la banque est comparé avant d'être exécuté (fichiers modifiés sur le disque : la liaison refuse de démarrer)
function verifier(racine, empreintes) {
  if (!empreintes || !fs.existsSync(empreintes)) return;
  const E = JSON.parse(fs.readFileSync(empreintes, 'utf8'));
  for (const [f, h] of Object.entries(E)) {
    const p = path.join(racine, f); let v = '';
    try { v = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { /* absent */ }
    if (v !== h) throw new Error('Fichiers de la liaison bancaire modifiés sur ce Mac (' + f + ') : par sécurité, la banque est bloquée. Réinstallez Patrimoine AI.');
  }
}
function creer({ dossier, racine, coffre, empreintes = '', quandLiee = () => {} }) {
  const fConf = path.join(dossier, 'banque.json'), fSession = path.join(dossier, 'banque-session.bin');
  let mods = null, attente = null;

  const lireConf = () => {
    try { const o = JSON.parse(fs.readFileSync(fConf, 'utf8')); return { ...o, cle: o.cle ? coffre.dechiffrer(Buffer.from(o.cle, 'base64')) : '' }; }
    catch (e) { return {}; }
  };
  const ecrireConf = o => {
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(fConf, JSON.stringify({ ...o, cle: o.cle ? coffre.chiffrer(o.cle).toString('base64') : '' }), { mode: 0o600 });
  };
  // réglages lus par banque/commun.mjs (conf()), passés au module seul : jamais dans process.env (hérité par les processus enfants)
  function env(C) {
    const c = lireConf();
    C.DEP.env = ({ ENABLE_LOCAL: '1', ENABLE_APP_ID: c.appId || '', ENABLE_PRIVATE_KEY: c.cle || '', ENABLE_REDIRECT_URL: RETOUR,
      ENABLE_ALLOWED_ORIGINS: 'app://patrimoine', ENABLE_MOCK: c.demo ? '1' : '', ENABLE_ASPSP_NAME: c.banque || '', ENABLE_ASPSP_COUNTRY: c.pays || '', ENABLE_ALLOWED_EMAILS: '' });
  }
  async function charger() {
    if (mods) return mods;
    verifier(racine, empreintes);
    const C = await import(pathToFileURL(path.join(racine, 'commun.mjs')).href), H = {};
    for (const r of ROUTES) H[r] = (await import(pathToFileURL(path.join(racine, 'routes', r + '.mjs')).href)).default;
    C.DEP.utilisateur = async () => ({ uid: 'mac', email: '', emailVerifie: true, jeton: '' }); // l'utilisateur est celui de la session macOS
    C.DEP.stockage = {
      async lire(u, c) { if (!fs.existsSync(fSession)) return null; try { return C.ouvrir(coffre.dechiffrer(fs.readFileSync(fSession)), c); } catch (e) { return null; } },
      async ecrire(u, c, o) { fs.mkdirSync(dossier, { recursive: true }); const tmp = fSession + '.tmp'; fs.writeFileSync(tmp, coffre.chiffrer(C.sceller(o, c)), { mode: 0o600 }); fs.renameSync(tmp, fSession); },
      async effacer() { fs.rmSync(fSession, { force: true }); }
    };
    return (mods = { C, H });
  }

  // attente du retour de la banque (une seule à la fois, 35 minutes au plus : le « state » vaut 30 minutes)
  function fermerAttente() { if (!attente) return; clearTimeout(attente.minuteur); try { attente.srv.close(); } catch (e) { /* déjà fermé */ } attente = null; }
  function ecouter() {
    fermerAttente();
    return new Promise((ok, ko) => {
      const srv = http.createServer(async (req, res) => {
        const u = new URL(req.url, 'http://127.0.0.1');
        // seulement une page ouverte à cette adresse exacte (protège du « DNS rebinding » : un site qui se ferait passer pour 127.0.0.1)
        if (req.method !== 'GET' || u.pathname !== '/banque' || req.headers.host !== '127.0.0.1:' + srv.address().port) { res.writeHead(404); return res.end(); }
        const code = u.searchParams.get('code') || '', state = u.searchParams.get('state') || '', err = u.searchParams.get('error_description') || u.searchParams.get('error') || '';
        let titre, texte, bon = false;
        if (err) { titre = 'Liaison annulée'; texte = 'La banque indique : ' + err.slice(0, 200) + '. Vous pouvez recommencer depuis Patrimoine AI.'; }
        else {
          const r = await appeler('retour', 'POST', JSON.stringify({ code, state })), d = await r.json().catch(() => ({}));
          bon = r.status === 200; titre = bon ? 'Banque liée' : 'Liaison impossible';
          texte = bon ? 'Vous pouvez fermer cet onglet et revenir dans Patrimoine AI : vos comptes s’y affichent.' : (d.message || 'Relancez « Lier ma banque » depuis Patrimoine AI.');
        }
        res.writeHead(bon ? 200 : 400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY' });
        res.end(`<!DOCTYPE html><meta charset="utf-8"><title>Patrimoine AI</title><body style="font:17px system-ui;display:grid;place-items:center;min-height:90vh;text-align:center;color:#16201b"><div><h1 style="font-size:22px">${esc(titre)}</h1><p>${esc(texte)}</p></div>`);
        if (bon || err) { fermerAttente(); quandLiee(bon); }
      });
      srv.on('error', ko);
      srv.listen(0, '127.0.0.1', () => { attente = { srv, minuteur: setTimeout(fermerAttente, 35 * 60e3) }; ok(srv.address().port); });
    });
  }

  // appel d'une route : même enveloppe que sur un serveur (origine, erreurs propres), réponse HTTP standard
  async function appeler(nom, methode = 'GET', corps = '', recherche = '') {
    let C, H;
    try { ({ C, H } = await charger()); } catch (e) { return new Response(JSON.stringify({ code: 'integrite', message: e.message }), { status: 500, headers: { 'content-type': 'application/json; charset=utf-8' } }); }
    const h = H[nom];
    env(C);
    if (!h) return new Response(JSON.stringify({ code: 'route', message: 'Route inconnue.' }), { status: 404, headers: { 'content-type': 'application/json' } });
    const avecCorps = methode !== 'GET' && methode !== 'HEAD' && corps;
    const req = new Request('app://patrimoine/api/banque/' + nom + (recherche || ''), { method: methode, headers: { origin: 'app://patrimoine', ...(avecCorps ? { 'content-type': 'application/json' } : {}) }, body: avecCorps ? corps : undefined });
    if (nom !== 'demarrer') return h(req, {});
    const port = await ecouter();
    C.DEP.prefixeEtat = 'mac' + port + '-';
    try {
      const r = await h(req, {});
      if (r.status !== 200) { fermerAttente(); return r; }
      const d = await r.json();
      // démonstration : la « banque » renvoie tout de suite vers cette application, sans passer par la page en ligne
      if (lireConf().demo && !lireConf().appId) { const v = new URL(d.url); d.url = `http://127.0.0.1:${port}/banque${v.search}`; }
      return new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } });
    } finally { C.DEP.prefixeEtat = ''; }
  }

  // fichier .pem téléchargé chez Enable Banking : son nom (sans .pem) est l'identifiant de l'application
  function enregistrerCle(nomFichier, texte) {
    const appId = path.basename(String(nomFichier || '')).replace(/\.pem$/i, '').trim(), cle = String(texte || '').trim();
    if (!/^[A-Za-z0-9][\w-]{7,79}$/.test(appId)) throw new Error('Nom de fichier inattendu : choisissez le fichier .pem tel que téléchargé chez Enable Banking (son nom est l’identifiant de l’application).');
    if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(cle)) throw new Error('Ce fichier ne contient pas de clé privée.');
    try { crypto.createPrivateKey(cle); } catch (e) { throw new Error('Clé privée illisible : choisissez le fichier .pem complet.'); }
    const c = lireConf(); ecrireConf({ ...c, appId, cle, demo: false });
    return etatConf();
  }
  const etatConf = () => { const c = lireConf(); return { cle: !!(c.appId && c.cle), appId: c.appId || '', demo: !!c.demo, retour: RETOUR }; };
  function demo(actif) { const c = lireConf(); ecrireConf({ ...c, demo: !!actif }); return etatConf(); }
  function oublier() { fs.rmSync(fConf, { force: true }); fs.rmSync(fSession, { force: true }); fermerAttente(); return etatConf(); }

  return { appeler, enregistrerCle, etatConf, demo, oublier, arreter: fermerAttente, RETOUR };
}

module.exports = { creer, verifier, RETOUR };
