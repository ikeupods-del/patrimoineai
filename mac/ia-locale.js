// IA locale partagée par les outils privés (Studio Posts, Studio Sites) : un modèle de langage (Qwen3 4B Instruct, licence Apache 2.0,
// ~2,5 Go) qui tourne sur la puce du Mac, dans un processus à part (node-llama-cpp). Rien n'est envoyé sur internet une fois le modèle téléchargé.
// Le modèle est rangé dans le dossier de QuentMovie (~/Movies/QuentMovie/modeles) : un seul téléchargement pour tous les outils.
// Copie de marketing/ia-locale/ (dépôt Quentools) : Patrimoine AI partage le même modèle que QuentMovie, Studio Posts et Studio Sites.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { fork } = require('child_process');

const MODELE = { fichier: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf', url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf', mo: 2500 };
const DOSSIER_PARTAGE = path.join(os.homedir(), 'Movies', 'QuentMovie', 'modeles');

// Téléchargement avec suivi, redirections suivies (Hugging Face redirige vers son CDN) ; fichier .part renommé à la fin
function telecharger(url, dest, surProgres, profondeur = 0) {
  return new Promise((ok, ko) => {
    if (profondeur > 6) return ko(new Error('Trop de redirections'));
    https.get(url, { headers: { 'User-Agent': 'QuenTools-outils/1.0' } }, r => {
      if ([301, 302, 303, 307, 308].includes(r.statusCode) && r.headers.location) { r.resume(); return telecharger(new URL(r.headers.location, url).toString(), dest, surProgres, profondeur + 1).then(ok, ko); }
      if (r.statusCode !== 200) { r.resume(); return ko(new Error(`Téléchargement impossible (erreur ${r.statusCode})`)); }
      const total = +r.headers['content-length'] || 0; let recu = 0; const f = fs.createWriteStream(dest);
      r.on('data', d => { recu += d.length; if (surProgres && total) surProgres(recu / total); });
      r.pipe(f); f.on('finish', () => f.close(() => ok(recu))); f.on('error', ko); r.on('error', ko);
    }).on('error', ko);
  });
}

// opts.dossier : dossier des modèles ; opts.worker : programme du processus ; opts.remplacement : fonction (msg) → résultat (essais sans modèle)
function creer(opts = {}) {
  const dossier = opts.dossier || DOSSIER_PARTAGE, chemin = path.join(dossier, MODELE.fichier), worker = opts.worker || path.join(__dirname, 'ia-worker.js');
  let proc = null, attente = new Map(), n = 0, installation = null;

  function processus() {
    if (proc) return proc;
    proc = fork(worker, [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let err = ''; proc.stderr.on('data', d => { err = (err + d).slice(-2000); });
    proc.on('message', m => { const a = attente.get(m.id); if (!a) return; attente.delete(m.id); m.ok ? a.ok(m) : a.ko(new Error(m.erreur)); });
    proc.on('exit', code => { for (const a of attente.values()) a.ko(new Error('L’IA locale s’est arrêtée' + (err ? ' : ' + err.trim().split('\n').pop() : ` (code ${code})`))); attente = new Map(); proc = null; });
    return proc;
  }
  const demander = msg => new Promise((ok, ko) => { const id = ++n; attente.set(id, { ok, ko }); processus().send({ id, ...msg }); });
  const installee = () => !!opts.remplacement || fs.existsSync(chemin);
  const etat = () => ({ installee: installee(), mo: MODELE.mo, dossier });

  async function installer(surProgres) {
    if (installee()) return;
    if (installation) return installation;
    installation = (async () => {
      fs.mkdirSync(dossier, { recursive: true });
      const part = chemin + '.part';
      const t = await telecharger(MODELE.url, part, surProgres);
      if (t < 5e8) { fs.rmSync(part, { force: true }); throw new Error('Téléchargement de l’IA incomplet : réessaie.'); }
      fs.renameSync(part, chemin);
    })().finally(() => { installation = null; });
    return installation;
  }

  // jetons : ~1 pour 3 caractères en français ; contexte et réponse sont dimensionnés au plus juste
  const jetons = t => Math.ceil(String(t).length / 2.8);
  const contexte = (systeme, demande, sortie) => Math.min(8192, Math.max(1536, Math.ceil((jetons(systeme) + jetons(demande) + sortie + 200) / 256) * 256));
  // Réponse structurée (schéma JSON) : la grammaire garantit un JSON valide ; une réponse coupée est refaite avec une marge double
  async function ecrire({ systeme, demande, schema, maxTokens = 700, temperature = 0.5 }) {
    if (opts.remplacement) return opts.remplacement({ systeme, demande, schema, maxTokens, temperature });
    if (!installee()) throw new Error('L’IA locale n’est pas installée.');
    const essai = async sortie => (await demander({ type: 'ecrire', modele: chemin, systeme, demande, schema, maxTokens: sortie, temperature, contexte: contexte(systeme, demande, sortie) })).resultat;
    try { return await essai(maxTokens); }
    catch (e) { if (!/JSON|Unterminated|Unexpected/i.test(e.message)) throw e; return essai(Math.min(4000, maxTokens * 2)); }
  }
  const arreter = () => { if (proc) proc.kill(); };
  return { etat, installer, ecrire, arreter, MODELE };
}

module.exports = { creer, MODELE, DOSSIER_PARTAGE };
