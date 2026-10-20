// Copie l'application web (index.html, moteur des cours, lecteur PDF…) dans mac/app avant la construction : une seule source pour le web et le Mac.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..'), DEST = path.join(__dirname, '..', 'app');
const FICHIERS = ['index.html', 'config.js', 'marches.js', 'calculs.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
fs.rmSync(DEST, { recursive: true, force: true }); fs.mkdirSync(DEST, { recursive: true });
for (const f of FICHIERS) fs.copyFileSync(path.join(SRC, f), path.join(DEST, f));
fs.cpSync(path.join(SRC, 'vendor'), path.join(DEST, 'vendor'), { recursive: true });
fs.cpSync(path.join(SRC, 'banque'), path.join(DEST, 'banque'), { recursive: true }); // liaison bancaire (exécutée par banque-locale.js)
// empreintes des fichiers de la banque (sortis de l'archive à l'installation) : vérifiées avant chaque utilisation
const crypto = require('crypto'), E = {};
(function parcourir(d, rel) { for (const n of fs.readdirSync(d).sort()) { const p = path.join(d, n), r = rel ? rel + '/' + n : n; if (fs.statSync(p).isDirectory()) parcourir(p, r); else E[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } })(path.join(DEST, 'banque'), '');
fs.writeFileSync(path.join(DEST, 'banque-empreintes.json'), JSON.stringify(E, null, 1));
console.log('Application copiée dans mac/app :', FICHIERS.length, 'fichiers + vendor/ + banque/');
