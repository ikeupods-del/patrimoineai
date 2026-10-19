// Dictée de l'assistant sur le Mac : la voix devient du texte sur l'ordinateur, sans internet.
// Modèle de reconnaissance Parakeet (≈ 660 Mo, licence CC-BY-4.0) rangé dans le dossier partagé de QuentMovie
// (~/Movies/QuentMovie/modeles) : s'il est déjà installé par QuentMovie, rien n'est téléchargé.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork, execFile } = require('child_process');
const { requete } = require('./maj');
const { DOSSIER_PARTAGE } = require('./ia-locale');

const ARCHIVE = 'sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8';
const URL_ARCHIVE = `https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/${ARCHIVE}.tar.bz2`;

const unpack = p => p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
function dossierSherpa() {
  try { return unpack(path.dirname(require.resolve(`sherpa-onnx-${process.platform}-${process.arch}/package.json`))); } catch (e) { return null; }
}

function creer(opts = {}) {
  const dossier = opts.dossier || DOSSIER_PARTAGE, modele = path.join(dossier, ARCHIVE), sherpa = dossierSherpa();
  let proc = null, attente = new Map(), n = 0, installation = null;
  const installee = () => fs.existsSync(path.join(modele, '.complet'));
  const etat = () => ({ dispo: !!sherpa, installee: installee(), mo: 660 });
  function processus() {
    if (proc) return proc;
    const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', DYLD_LIBRARY_PATH: sherpa + (process.env.DYLD_LIBRARY_PATH ? ':' + process.env.DYLD_LIBRARY_PATH : ''), LD_LIBRARY_PATH: sherpa + (process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : '') };
    proc = fork(path.join(__dirname, 'dictee-worker.js'), [], { env, stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    let err = ''; proc.stderr.on('data', d => { err = (err + d).slice(-2000); });
    proc.on('message', m => { const a = attente.get(m.id); if (!a) return; attente.delete(m.id); m.ok ? a.ok(m) : a.ko(new Error(m.erreur)); });
    proc.on('exit', code => { for (const a of attente.values()) a.ko(new Error('La dictée s’est arrêtée' + (err ? ' : ' + err.trim().split('\n').pop() : ` (code ${code})`))); attente = new Map(); proc = null; });
    return proc;
  }
  // Téléchargement une seule fois (partagé avec QuentMovie), puis décompression avec l'outil tar du Mac
  function installer(surProgres) {
    if (installee()) return Promise.resolve();
    if (installation) return installation;
    installation = (async () => {
      if (!sherpa) throw new Error('La dictée n’est pas disponible sur cet ordinateur.');
      fs.mkdirSync(dossier, { recursive: true });
      const f = path.join(dossier, ARCHIVE + '.tar.bz2');
      await requete(URL_ARCHIVE, { dest: f, quoi: 'de modèles', onProgress: (r, t) => { if (surProgres && t) surProgres(r / t); } });
      fs.rmSync(modele, { recursive: true, force: true });
      await new Promise((ok, ko) => execFile('tar', ['-xjf', f, '-C', dossier], e => (e ? ko(new Error('Décompression impossible : ' + e.message)) : ok())));
      fs.rmSync(f, { force: true });
      if (!fs.existsSync(modele)) throw new Error('Modèle de dictée inattendu : réessaie.');
      fs.writeFileSync(path.join(modele, '.complet'), new Date().toISOString());
    })().finally(() => { installation = null; });
    return installation;
  }
  // samples : son du micro, 16 kHz mono (nombres entre -1 et 1)
  function ecouter(samples) {
    if (!installee()) return Promise.reject(new Error('La dictée n’est pas installée.'));
    if (!samples || samples.length < 1600) return Promise.resolve({ texte: '' });
    return new Promise((ok, ko) => { const id = ++n; attente.set(id, { ok, ko }); processus().send({ id, dossier: modele, samples: Array.from(samples) }); });
  }
  const arreter = () => { if (proc) proc.kill(); };
  return { etat, installer, ecouter, arreter };
}

module.exports = { creer, ARCHIVE };
