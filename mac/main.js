// Patrimoine AI pour Mac (Electron) : la même application que la version en ligne, avec en plus
// l'accès direct aux cours (sans relais), l'IA du Mac, le verrouillage Touch ID, les sauvegardes automatiques,
// les notifications, le bilan PDF et les mises à jour automatiques. Produit par QuenTools.
'use strict';
const { app, BrowserWindow, Menu, shell, ipcMain, protocol, net, session, dialog, Notification, systemPreferences, powerMonitor, Tray, nativeImage, nativeTheme, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const AUTOTEST = process.env.PATRIMOINE_AUTOTEST || '';
const RACINE = path.join(__dirname, 'app');
const ORIGINE = 'app://patrimoine';
const PAGE_CONNEXION = 'https://ikeupods-del.github.io/patrimoineai/connexion-mac.html';
const DEPOT = 'ikeupods-del/patrimoineai';

// L'application est servie par une adresse interne stable (app://patrimoine) : ses données y restent attachées d'une version à l'autre.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

if (!app.requestSingleInstanceLock()) app.quit();
let win = null, tray = null, ia = null, quitter = false;
// Fermer la fenêtre (⌘W, bouton rouge) la cache seulement : l'application reste ouverte en arrière-plan (barre des menus,
// rappels de paiement, alertes de cours, résumé du mois) ; ⌘Q quitte vraiment.
app.on('before-quit', () => { quitter = true; });
const montrer = () => { if (!win) return ouvrir(); if (win.isMinimized()) win.restore(); win.show(); win.focus(); };
const depuisNotrePage = e => !!win && !win.isDestroyed() && e.sender === win.webContents;
const garde = fn => async (e, ...a) => { if (!depuisNotrePage(e)) throw new Error('refusé'); return fn(e, ...a); };
const envoyer = (canal, ...a) => { if (win && !win.isDestroyed()) win.webContents.send(canal, ...a); };

/* ---------- Fichiers de l'application ---------- */
function servir() {
  protocol.handle('app', async req => {
    const u = new URL(req.url);
    if (u.host !== 'patrimoine') return new Response('Introuvable', { status: 404 });
    let p = decodeURIComponent(u.pathname);
    // liaison bancaire : les fonctions de banque/routes tournent dans l'application (aucun serveur en ligne)
    if (p.startsWith('/api/banque/')) {
      const corps = req.method === 'POST' || req.method === 'DELETE' ? await req.text() : '';
      if (corps.length > 4000) return new Response(JSON.stringify({ code: 'requete', message: 'Demande trop volumineuse.' }), { status: 413 });
      return BANQUE().appeler(p.slice(12), req.method, corps, u.search);
    }
    if (!p || p === '/') p = '/index.html';
    const f = path.normalize(path.join(RACINE, p));
    if (!f.startsWith(RACINE + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return new Response('Introuvable', { status: 404 });
    const r = await net.fetch(pathToFileURL(f).toString());
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
    const h = new Headers(r.headers); const t = types[path.extname(f)]; if (t) h.set('content-type', t);
    return new Response(r.body, { status: 200, headers: h });
  });
}

/* ---------- Cours de bourse : accès direct à Yahoo Finance (sans relais tiers) ----------
   Yahoo n'accepte que ses propres pages comme origine : l'origine est donc présentée comme finance.yahoo.com,
   et la réponse est autorisée pour l'application. Seuls Yahoo Finance et le flux RSS de Google Actualités sont concernés. */
const YAHOO = /^(https|wss):\/\/([a-z0-9-]+\.)*finance\.yahoo\.com(:\d+)?\//i;
function reseau() {
  const s = session.defaultSession;
  const UA = `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
  s.webRequest.onBeforeSendHeaders({ urls: ['https://*.finance.yahoo.com/*', 'wss://*.finance.yahoo.com/*', 'https://news.google.com/*'] }, (d, cb) => {
    const h = d.requestHeaders;
    if (YAHOO.test(d.url)) { h.Origin = 'https://finance.yahoo.com'; h.Referer = 'https://finance.yahoo.com/'; }
    else { // Google Actualités : requête présentée comme une simple lecture du flux par le navigateur
      for (const k of Object.keys(h)) if (/^(origin|referer|sec-fetch-.*|sec-ch-ua.*)$/i.test(k)) delete h[k];
      h['User-Agent'] = UA; h['Accept-Language'] = 'fr-FR,fr;q=0.9';
    }
    cb({ requestHeaders: h });
  });
  s.webRequest.onHeadersReceived({ urls: ['https://*.finance.yahoo.com/*', 'https://news.google.com/rss/*'] }, (d, cb) => {
    const h = {};
    for (const [k, v] of Object.entries(d.responseHeaders || {})) if (!/^access-control-allow-(origin|credentials)$/i.test(k)) h[k] = v;
    h['Access-Control-Allow-Origin'] = [ORIGINE];
    cb({ responseHeaders: h });
  });
  // Rien d'autre que nos pages ne s'ouvre dans la fenêtre ; les autres liens partent dans le navigateur
  s.setPermissionRequestHandler((wc, perm, ok, d) => ok(perm === 'notifications' || perm === 'clipboard-sanitized-write' || (perm === 'media' && !!d && (d.mediaTypes || []).every(t => t === 'audio') && wc === (win && win.webContents)))); // micro seul : dictée de l'assistant
}

/* ---------- IA du Mac (modèle partagé avec les autres logiciels QuenTools) ---------- */
const IA = () => ia || (ia = require('./ia-locale').creer(process.env.PATRIMOINE_IA_DOSSIER ? { dossier: process.env.PATRIMOINE_IA_DOSSIER } : {}));
/* ---------- Dictée de l'assistant (reconnaissance de la voix sur le Mac, modèle partagé avec QuentMovie) ---------- */
let dictee = null;
const DICTEE = () => dictee || (dictee = require('./dictee').creer());
ipcMain.handle('dictee:etat', garde(() => DICTEE().etat()));
ipcMain.handle('dictee:micro', garde(async () => systemPreferences.getMediaAccessStatus('microphone') === 'granted' || systemPreferences.askForMediaAccess('microphone')));
ipcMain.handle('dictee:installer', garde(async e => { await DICTEE().installer(p => { if (!e.sender.isDestroyed()) e.sender.send('dictee:progres', p); }); return DICTEE().etat(); }));
ipcMain.handle('dictee:ecouter', garde((e, samples) => DICTEE().ecouter(samples)));
ipcMain.handle('ia:etat', garde(() => IA().etat()));
ipcMain.handle('ia:installer', garde(async e => { await IA().installer(p => { if (!e.sender.isDestroyed()) e.sender.send('ia:progres', p); }); return IA().etat(); }));
ipcMain.handle('ia:ecrire', garde((e, m) => {
  const s = (x, n) => String(x || '').slice(0, n);
  return IA().ecrire({ systeme: s(m && m.systeme, 4000), demande: s(m && m.demande, 30000), maxTokens: Math.min(1500, Math.max(50, +(m && m.maxTokens) || 800)), temperature: Math.min(1, Math.max(0, +(m && m.temperature) || 0.3)) });
}));

/* ---------- Liaison bancaire (Enable Banking) : clé gardée par le trousseau, session sur ce Mac (banque-locale.js) ---------- */
let banque = null;
const BANQUE = () => banque || (banque = require('./banque-locale').creer({
  dossier: app.getPath('userData'),
  racine: path.join(__dirname, 'app', 'banque').replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep), // modules .mjs lus hors de l'archive
  coffre: { chiffrer: t => { if (!safeStorage.isEncryptionAvailable()) throw new Error('trousseau indisponible'); return safeStorage.encryptString(t); }, dechiffrer: b => safeStorage.decryptString(b) },
  quandLiee: ok => { if (ok) { montrer(); envoyer('commande', 'bqlie'); } }
}));
ipcMain.handle('banque:conf', garde(() => BANQUE().etatConf()));
ipcMain.handle('banque:demo', garde((e, actif) => BANQUE().demo(!!actif)));
ipcMain.handle('banque:oublier', garde(() => BANQUE().oublier()));
ipcMain.handle('banque:cle', garde(async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Clé de l’application Enable Banking', message: 'Choisissez le fichier .pem téléchargé chez Enable Banking', properties: ['openFile'], filters: [{ name: 'Clé privée', extensions: ['pem'] }] });
  if (r.canceled || !r.filePaths[0]) return { annule: true, ...BANQUE().etatConf() };
  const f = r.filePaths[0]; if (fs.statSync(f).size > 20000) throw new Error('Fichier trop gros pour une clé .pem.');
  return BANQUE().enregistrerCle(path.basename(f), fs.readFileSync(f, 'utf8'));
}));

/* ---------- Sauvegardes automatiques : une par jour, 60 jours, dans le dossier de l'application ---------- */
const DOSSIER_SAUV = () => path.join(app.getPath('userData'), 'Sauvegardes');
const RE_SAUV = /^patrimoine-(\d{4}-\d{2}-\d{2})\.json$/;
function listeSauv() {
  const d = DOSSIER_SAUV(); if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(n => RE_SAUV.test(n)).sort().reverse().map(nom => ({ nom, date: RE_SAUV.exec(nom)[1], taille: fs.statSync(path.join(d, nom)).size }));
}
const etatSauv = () => { const L = listeSauv(); return { n: L.length, dernier: L.length ? Date.parse(L[0].date + 'T12:00:00') : 0, dossier: DOSSIER_SAUV() }; };
ipcMain.handle('sauv:ecrire', garde((e, texte) => {
  const t = String(texte || '');
  if (t.length < 20 || t.length > 40e6) throw new Error('sauvegarde refusée');
  JSON.parse(t); // n'enregistre que des données lisibles
  const d = DOSSIER_SAUV(); fs.mkdirSync(d, { recursive: true });
  const jour = new Date().toLocaleDateString('sv-SE'), f = path.join(d, `patrimoine-${jour}.json`), tmp = f + '.tmp';
  fs.writeFileSync(tmp, t, { mode: 0o600 }); fs.renameSync(tmp, f);
  listeSauv().slice(60).forEach(x => fs.rmSync(path.join(d, x.nom), { force: true }));
  return etatSauv();
}));
ipcMain.handle('sauv:etat', garde(() => etatSauv()));
ipcMain.handle('sauv:liste', garde(() => listeSauv()));
ipcMain.handle('sauv:lire', garde((e, nom) => { if (!RE_SAUV.test(String(nom))) throw new Error('nom invalide'); return fs.readFileSync(path.join(DOSSIER_SAUV(), String(nom)), 'utf8'); }));
ipcMain.handle('sauv:ouvrir', garde(() => { fs.mkdirSync(DOSSIER_SAUV(), { recursive: true }); return shell.openPath(DOSSIER_SAUV()); }));

/* ---------- Touch ID ---------- */
ipcMain.handle('touch:dispo', garde(() => { try { return process.platform === 'darwin' && systemPreferences.canPromptTouchID(); } catch (e) { return false; } }));
ipcMain.handle('touch:demander', garde(async (e, raison) => {
  try { await systemPreferences.promptTouchID(String(raison || 'déverrouiller Patrimoine AI').slice(0, 120)); return true; }
  catch (er) { return false; }
}));

/* ---------- Notifications du Mac ---------- */
ipcMain.handle('notif', garde((e, titre, corps) => {
  if (!Notification.isSupported()) return false;
  const n = new Notification({ title: String(titre || '').slice(0, 120), body: String(corps || '').slice(0, 300), silent: false });
  n.on('click', montrer);
  n.show(); return true;
}));

/* ---------- Coffre à documents : clé de chiffrement protégée par le trousseau du Mac ----------
   Les documents sont chiffrés dans la page (AES-256) ; leur clé est gardée ici, chiffrée par le trousseau (safeStorage). */
const FICHIER_CLE = () => path.join(app.getPath('userData'), 'coffre.cle');
ipcMain.handle('coffre:cle', garde(() => {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('trousseau indisponible');
  const f = FICHIER_CLE();
  if (fs.existsSync(f)) return safeStorage.decryptString(fs.readFileSync(f));
  const cle = crypto.randomBytes(32).toString('base64');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, safeStorage.encryptString(cle), { mode: 0o600 });
  return cle;
}));
// Un document ouvert est déchiffré dans un dossier temporaire privé, effacé après 10 minutes et à la fermeture
const DOSSIER_OUVERTS = () => path.join(os.tmpdir(), 'patrimoine-ai-documents');
ipcMain.handle('coffre:ouvrir', garde(async (e, nom, octets) => {
  const d = path.join(DOSSIER_OUVERTS(), crypto.randomBytes(6).toString('hex'));
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  const f = path.join(d, String(nom || 'document').replace(/[\/\\:*?"<>|\x00-\x1f]/g, '_').replace(/^\.+/, '').slice(0, 120) || 'document');
  fs.writeFileSync(f, Buffer.from(octets), { mode: 0o600 });
  setTimeout(() => fs.rmSync(d, { recursive: true, force: true }), 10 * 60000);
  if (AUTOTEST) return { ok: true, taille: fs.statSync(f).size };
  const err = await shell.openPath(f); if (err) throw new Error(err);
  return { ok: true };
}));
app.on('will-quit', () => { try { fs.rmSync(DOSSIER_OUVERTS(), { recursive: true, force: true }); } catch (e) { /* rien à effacer */ } });

/* ---------- Bilan PDF ---------- */
ipcMain.handle('pdf', garde(async (e, html, nom) => {
  const h = String(html || ''); if (!/^<!DOCTYPE html>/i.test(h) || h.length > 8e6) throw new Error('document invalide');
  const fichier = String(nom || 'Bilan.pdf').replace(/[^\w.\- ]/g, '_').replace(/\.pdf$/i, '') + '.pdf';
  const w = new BrowserWindow({ show: false, width: 900, height: 1200, webPreferences: { sandbox: true, javascript: false, contextIsolation: true } });
  try {
    await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(h));
    const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true });
    let cible;
    if (AUTOTEST) cible = path.join(os.tmpdir(), fichier);
    else {
      const r = await dialog.showSaveDialog(win, { title: 'Enregistrer le bilan', defaultPath: path.join(app.getPath('documents'), fichier), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
      if (r.canceled || !r.filePath) return { ok: false };
      cible = r.filePath;
    }
    fs.writeFileSync(cible, pdf);
    if (!AUTOTEST) shell.showItemInFolder(cible);
    return { ok: true, nom: path.basename(cible), taille: pdf.length };
  } finally { w.destroy(); }
}));

/* ---------- Barre des menus : variation du jour, patrimoine net (masqué avec les montants) ou les deux ---------- */
ipcMain.handle('barre', garde((e, texte) => {
  const t = String(texte || '').slice(0, 24);
  if (!t) { if (tray) { tray.destroy(); tray = null; } return false; }
  if (!tray) {
    tray = new Tray(nativeImage.createEmpty());
    tray.setToolTip('Patrimoine AI');
    tray.on('click', montrer);
    tray.on('right-click', () => tray.popUpContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir Patrimoine AI', click: montrer },
      { label: 'Verrouiller', click: cmd('lock') },
      { type: 'separator' }, { label: 'Quitter Patrimoine AI', click: () => app.quit() }])));
  }
  tray.setTitle(t, { fontType: 'monospacedDigit' });
  return true;
}));

/* ---------- Pastille du Dock : paiements à confirmer (nombre seul, jamais de montant) ---------- */
ipcMain.handle('badge', garde((e, n) => { const k = Math.max(0, Math.min(99, Math.round(+n) || 0)); if (app.dock) app.dock.setBadge(k ? String(k) : ''); return k; }));

/* ---------- Ouverture à l'ouverture de session (la fenêtre se ferme d'un ⌘W : l'application reste dans la barre des menus) ---------- */
ipcMain.handle('demarrage', garde((e, actif) => {
  if (typeof actif === 'boolean' && app.isPackaged) app.setLoginItemSettings({ openAtLogin: actif });
  return !!app.getLoginItemSettings().openAtLogin;
}));

/* ---------- Connexion Google : dans le navigateur du Mac (Google refuse les fenêtres intégrées) ----------
   L'application attend la réponse sur 127.0.0.1 (port choisi au hasard), avec un code à usage unique. */
let connexion = null;
ipcMain.handle('google', garde(async () => {
  if (connexion) connexion.annuler();
  try { const t = await net.fetch(PAGE_CONNEXION, { method: 'HEAD', cache: 'no-store' }); if (t.status === 404) return { message: 'La page de connexion n’est pas encore en ligne : publiez la nouvelle version du site, puis réessayez.' }; }
  catch (e) { return { message: 'Pas de connexion Internet : la synchronisation demande d’être en ligne.' }; }
  return new Promise(ok => {
    const etat = crypto.randomBytes(24).toString('base64url');
    let fini = false, minuteur = null;
    const terminer = r => { if (fini) return; fini = true; clearTimeout(minuteur); try { srv.close(); } catch (e) { /* déjà fermé */ } connexion = null; ok(r); };
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/retour') { res.writeHead(404); return res.end(); }
      const bon = u.searchParams.get('etat') === etat && /^[\w.-]{20,4096}$/.test(u.searchParams.get('id') || '');
      res.writeHead(bon ? 200 : 400, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(`<!DOCTYPE html><meta charset="utf-8"><title>Patrimoine AI</title><body style="font:17px system-ui;display:grid;place-items:center;min-height:90vh;text-align:center;color:#16201b"><div><h1 style="font-size:22px">${bon ? 'Connexion réussie' : 'Lien expiré'}</h1><p>${bon ? 'Vous pouvez fermer cet onglet et revenir dans Patrimoine AI.' : 'Relancez la connexion depuis l’application.'}</p></div>`);
      if (bon) { terminer({ id: u.searchParams.get('id'), acces: u.searchParams.get('acces') || '' }); if (win) { win.show(); win.focus(); app.focus({ steal: true }); } }
    });
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      shell.openExternal(`${PAGE_CONNEXION}#port=${port}&etat=${etat}`);
      minuteur = setTimeout(() => terminer({ annule: true, message: 'Délai dépassé : relancez la connexion.' }), 5 * 60e3);
    });
    srv.on('error', er => terminer({ message: 'Connexion impossible : ' + er.message }));
    connexion = { annuler: () => terminer({ annule: true, message: 'Connexion annulée' }) };
  });
}));

/* ---------- Mises à jour automatiques (versions publiées dans les Releases du dépôt) ---------- */
const { Maj, emplacementApp } = require('./maj');
const maj = new Maj({ nom: 'Patrimoine AI', fichier: 'Patrimoine-AI', depot: DEPOT, version: app.getVersion(), dossier: path.join(app.getPath('userData'), 'mises-a-jour'), app: emplacementApp(process.execPath), actif: app.isPackaged && process.platform === 'darwin' && !AUTOTEST });
const verifierMaj = () => maj.verifier().then(e => { envoyer('maj:etat', e); return e; });
ipcMain.handle('maj:etat', garde(() => maj.etat));
ipcMain.handle('maj:verifier', garde(() => verifierMaj()));
ipcMain.handle('maj:installer', garde(() => { if (maj.installer(true)) setTimeout(() => app.quit(), 200); return maj.etat; }));
app.on('will-quit', () => { maj.installer(false); if (ia) ia.arreter(); if (dictee) dictee.arreter(); if (banque) banque.arreter(); });

/* ---------- Menus ---------- */
const cmd = c => () => { if (!win) ouvrir(); envoyer('commande', c); };
function menu() {
  const vues = [['Accueil', 'v1'], ['Placements', 'v2'], ['Budget', 'v3'], ['Objectifs', 'v4'], ['Marchés', 'v5'], ['Analyse', 'v6'], ['Assistant IA', 'v7'], ['Simulateurs', 'v8'], ['Actualités', 'v9']];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Patrimoine AI', submenu: [
      { role: 'about', label: 'À propos de Patrimoine AI' },
      { label: 'Rechercher les mises à jour…', click: () => { verifierMaj(); cmd('set')(); } },
      { type: 'separator' },
      { label: 'Réglages…', accelerator: 'Cmd+,', click: cmd('set') },
      { label: 'Verrouiller', accelerator: 'Ctrl+Cmd+L', click: cmd('lock') },
      { type: 'separator' }, { role: 'services', label: 'Services' }, { type: 'separator' },
      { role: 'hide', label: 'Masquer Patrimoine AI' }, { role: 'hideOthers', label: 'Masquer les autres' }, { role: 'unhide', label: 'Tout afficher' },
      { type: 'separator' }, { role: 'quit', label: 'Quitter Patrimoine AI' }
    ] },
    { label: 'Fichier', submenu: [
      { label: 'Nouveau placement…', accelerator: 'Cmd+N', click: cmd('add') },
      { label: 'Nouvel objectif…', accelerator: 'Shift+Cmd+N', click: cmd('goal') },
      { type: 'separator' },
      { label: 'Importer un contrat ou un CSV…', accelerator: 'Cmd+O', click: cmd('imp') },
      { label: 'Exporter une sauvegarde…', accelerator: 'Cmd+S', click: cmd('exp') },
      { label: 'Exporter pour un tableur (CSV)…', accelerator: 'Shift+Cmd+S', click: cmd('csv') },
      { label: 'Exporter le bilan en PDF…', accelerator: 'Cmd+P', click: cmd('bilan') },
      { type: 'separator' },
      { label: 'Sauvegardes automatiques…', click: cmd('sauv') },
      { type: 'separator' }, { role: 'close', label: 'Fermer la fenêtre' }
    ] },
    { label: 'Édition', submenu: [
      { role: 'undo', label: 'Annuler' }, { role: 'redo', label: 'Rétablir' }, { type: 'separator' },
      { role: 'cut', label: 'Couper' }, { role: 'copy', label: 'Copier' }, { role: 'paste', label: 'Coller' }, { role: 'selectAll', label: 'Tout sélectionner' },
      { type: 'separator' },
      { label: 'Rechercher…', accelerator: 'Cmd+F', click: cmd('find') },
      { label: 'Recherche rapide…', accelerator: 'Cmd+K', click: cmd('pal') }
    ] },
    { label: 'Présentation', submenu: [
      ...vues.map(([l, c], i) => ({ label: l, accelerator: 'Cmd+' + (i + 1), click: cmd(c) })),
      { type: 'separator' },
      { label: 'Poser une question à l’assistant', accelerator: 'Cmd+J', click: cmd('ask') },
      { label: 'Masquer les montants', accelerator: 'Shift+Cmd+M', click: cmd('hide') },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Taille réelle' }, { role: 'zoomIn', label: 'Agrandir' }, { role: 'zoomOut', label: 'Réduire' },
      { type: 'separator' }, { role: 'togglefullscreen', label: 'Plein écran' },
      ...(app.isPackaged ? [] : [{ role: 'toggleDevTools', label: 'Outils de développement' }])
    ] },
    { role: 'windowMenu', label: 'Fenêtre' },
    { role: 'help', label: 'Aide', submenu: [
      { label: 'Mode d’emploi de Patrimoine AI', click: () => shell.openExternal('https://github.com/' + DEPOT + '#readme') },
      { label: 'Version en ligne (téléphone)', click: () => shell.openExternal('https://ikeupods-del.github.io/patrimoineai/') }
    ] }
  ]));
}

/* ---------- Fenêtre ---------- */
const FICHIER_FENETRE = () => path.join(app.getPath('userData'), 'fenetre.json');
// position gardée seulement si la fenêtre reste visible sur un écran branché (écran externe débranché : fenêtre recentrée sur l'écran du Mac)
const visible = b => b.x == null || screen.getAllDisplays().some(d => { const a = d.workArea; return b.x + 100 <= a.x + a.width && b.x + b.width - 100 >= a.x && b.y >= a.y - 10 && b.y + 60 <= a.y + a.height; });
function bornes() {
  try { const b = JSON.parse(fs.readFileSync(FICHIER_FENETRE(), 'utf8')); if (b.width >= 960 && b.height >= 640) {
    if (visible(b)) return b;
    const a = screen.getPrimaryDisplay().workArea; return { width: Math.min(b.width, a.width), height: Math.min(b.height, a.height), max: b.max };
  } } catch (e) { /* première ouverture */ }
  return { width: 1360, height: 880 };
}
function ouvrir() {
  const b = bornes();
  win = new BrowserWindow({
    ...b, minWidth: 960, minHeight: 640, show: false, title: 'Patrimoine AI',
    titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151311' : '#f3f4f1',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false }
  });
  if (b.max) win.maximize();
  win.loadURL(ORIGINE + '/index.html');
  win.once('ready-to-show', () => { if (!AUTOTEST) win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGINE + '/')) { e.preventDefault(); if (/^https?:\/\//.test(url)) shell.openExternal(url); } });
  win.webContents.session.on('will-download', (e, item) => { item.setSaveDialogOptions({ defaultPath: path.join(app.getPath('documents'), item.getFilename()) }); });
  win.on('close', e => {
    try { fs.writeFileSync(FICHIER_FENETRE(), JSON.stringify({ ...win.getNormalBounds(), max: win.isMaximized() })); } catch (er) { /* sans importance */ }
    if (!quitter && !AUTOTEST) { e.preventDefault(); if (win.isFullScreen()) { win.once('leave-full-screen', () => win.hide()); win.setFullScreen(false); } else win.hide(); }
  });
  win.on('closed', () => { win = null; });
  if (AUTOTEST) autotest();
}
app.on('second-instance', montrer);
['lock-screen', 'suspend'].forEach(ev => powerMonitor.on(ev, () => envoyer('verrou')));
// réveil du Mac : les flux de cours coupés pendant la veille sont rouverts, la synchronisation et les rappels relancés
powerMonitor.on('resume', () => setTimeout(() => envoyer('commande', 'reveil'), 3000));

/* ---------- Essai automatique de l'application construite (workflow, sur un vrai Mac) ---------- */
function autotest() {
  const res = { version: app.getVersion(), electron: process.versions.electron, arch: process.arch };
  const fin = () => { fs.writeFileSync(AUTOTEST, JSON.stringify(res, null, 2)); app.exit(0); };
  setTimeout(() => { res.erreur = 'délai dépassé'; fin(); }, 25 * 60000);
  win.webContents.on('console-message', (e, niveau, texte) => { const l = e.level != null ? e.level : niveau, m = String(e.message != null ? e.message : texte); if ((l === 'error' || l === 3) && !/Failed to load resource|WebSocket connection/i.test(m)) (res.erreursConsole = res.erreursConsole || []).push(m); });
  win.webContents.once('did-finish-load', async () => {
    const js = s => win.webContents.executeJavaScript(s);
    try {
      res.page = await js(`(async()=>{await new Promise(r=>setTimeout(r,1500));localStorage.removeItem('pat_data');D=load();demo();
        D.budget.inc=[{id:'i1',n:'Salaire',v:3000}];D.budget.exp=[{id:'e1',n:'Loyer',k:'fixe',v:800},{id:'e2',n:'Courses',k:'courant',v:400}];render();
        const T=totals(),b=budget();go('goals');openGoalForm('',GTPL[0]);goalSave();
        return{mac:!!MAC,hosted:HOSTED,net:Math.round(T.net),dettes:Math.round(T.debt),budget:Math.round(b.cap),plan:Math.round(b.plan.inv),objectifs:D.goals.length,classe:document.body.classList.contains('mac')}})()`);
      res.marches = await js(`(async()=>{const r=await marketApi('/api/market?list=idx');return{n:(r.items||[]).length,erreur:r.error||'',exemple:(r.items||[])[0]||null}})()`);
      res.graphique = await js(`(async()=>{const r=await marketApi('/api/market?chart=%5EFCHI&range=1mo');return{points:(r.pts||[]).length,erreur:r.error||''}})()`);
      res.direct = await js(`new Promise(ok=>{const t0=Date.now(),f=()=>{const s=FEED?FEED.status():{},n=FEED?Object.values(FEED.Q).filter(q=>q.src==='direct').length:0;if((n>0)||Date.now()-t0>40000)ok({yahoo:s.yahoo,binance:s.binance,mode:s.mode,coursEnDirect:n});else setTimeout(f,500)};f()})`);
      res.actualites = await js(`(async()=>{const r={};try{const L=newsParse(await newsGet(newsUrl(newsQuery('energie','europe'))));r.google=L.length;r.exemple=L[0]?L[0].t+' — '+L[0].s:''}catch(e){r.google=0;r.erreurGoogle=e.message}
        try{const L=await newsYahoo(newsAlt('energie','europe'));r.yahoo=L.length;r.exempleYahoo=L[0]?L[0].t:''}catch(e){r.yahoo=0;r.erreurYahoo=e.message}r.n=Math.max(r.google,r.yahoo);return r})()`);
      res.ia = await js(`(async()=>{const e=await MAC.ia.etat();return{pont:true,installee:e.installee,mo:e.mo,provider:!!PROV.mac}})()`);
      res.sauvegarde = await js(`(async()=>{D.assets.forEach(a=>delete a.demo);const s=await MAC.sauvegarder(JSON.stringify(D));return s})()`);
      res.pdf = await js(`MAC.pdf(bilanHTML(),'Bilan-essai.pdf')`);
      res.touch = await js(`MAC.touchDispo()`);
      res.maj = await js(`MAC.maj.etat()`);
      res.notif = await js(`MAC.notifier('Patrimoine AI','Essai automatique')`);
      res.coffre = await js(`Promise.race([new Promise(ok=>setTimeout(()=>ok({erreur:'délai'}),30000)),(async()=>{try{const id=await cofAjouter(new File([new TextEncoder().encode('essai du coffre')],'essai.txt',{type:'text/plain'}),'','autre');const b=await cofLire(id),m=D.docs.find(x=>x.id===id),o=await MAC.ouvrirDocument(m.nom,new Uint8Array(b));return{ok:new TextDecoder().decode(b)==='essai du coffre',cle:m.k,ouvert:o}}catch(e){return{erreur:String(e.message||e)}}})()])`);
      res.v63 = await js(`(()=>{D.ops=CL.fusionnerOps([],CL.lireReleve('Date;Libellé;Montant\\n01/09/2026;VIR SALAIRE;2500,00\\n05/09/2026;PRLV NETFLIX.COM;-13,49\\n06/09/2026;CB CARREFOUR;-80,00').ops,{});const r=CL.reelDuMois(D.ops,'2026-09');const f=CL.independance({age:40,capital:100000,epargne:500,depenses:2500});return{ops:D.ops.length,dep:r.dep,cat:D.ops.map(o=>o.cat).join(','),fire:f.cible,passifs:typeof passifsHTML()}})()`);
      res.iaReponse = await js(`(async()=>{await macIaEtat();if(!MACIA.installee)return{installee:false};const t0=Date.now();
        try{const m=await macAnswer('Combien dois-je investir chaque mois ?',[],{max:200});return{installee:true,src:m.src,note:m.note||'',texte:String(m.t).slice(0,1200),ms:Date.now()-t0}}
        catch(e){return{installee:true,erreur:String(e.message||e),ms:Date.now()-t0}}})()`);
      // liaison bancaire sans serveur, banque de démonstration : route app://, retour sur 127.0.0.1, session confiée au trousseau
      res.banque = await (async () => { const b = BANQUE(), r = {};
        try { b.demo(true); r.page = await js(`fetch('/api/banque/etat').then(r=>r.json())`);
          const d = await (await b.appeler('demarrer', 'POST')).json(); r.retour = (await net.fetch(d.url)).status;
          r.comptes = ((await (await b.appeler('comptes')).json()).comptes || []).length;
          r.ops = ((await (await b.appeler('operations', 'GET', '', '?compte=demo-courant')).json()).operations || []).length;
          r.trousseau = !fs.readFileSync(path.join(app.getPath('userData'), 'banque-session.bin')).toString('latin1').includes('"iv"');
        } catch (e) { r.erreur = e.message; } finally { b.oublier(); } return r; })();
      res.erreursPage = await js(`window.__erreurs||[]`);
    } catch (e) { res.erreur = e.message; }
    fin();
  });
}

app.whenReady().then(() => {
  servir(); reseau(); menu(); ouvrir();
  if (app.dock) app.dock.setMenu(Menu.buildFromTemplate([
    { label: 'Nouveau placement…', click: () => { montrer(); cmd('add')(); } },
    { label: 'Poser une question à l’assistant', click: () => { montrer(); cmd('ask')(); } },
    { label: 'Verrouiller', click: cmd('lock') }]));
  if (!AUTOTEST) { setTimeout(verifierMaj, 8000); setInterval(verifierMaj, 6 * 3600 * 1000); }
});
app.on('activate', montrer);
app.on('window-all-closed', () => { if (process.platform !== 'darwin' || AUTOTEST) app.quit(); });
