// Copie l'application web (index.html, moteur des cours, lecteur PDF…) dans mac/app avant la construction : une seule source pour le web et le Mac.
'use strict';
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, '..', '..'), DEST = path.join(__dirname, '..', 'app');
const FICHIERS = ['index.html', 'config.js', 'marches.js', 'calculs.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
fs.rmSync(DEST, { recursive: true, force: true }); fs.mkdirSync(DEST, { recursive: true });
for (const f of FICHIERS) fs.copyFileSync(path.join(SRC, f), path.join(DEST, f));
fs.cpSync(path.join(SRC, 'vendor'), path.join(DEST, 'vendor'), { recursive: true });
console.log('Application copiée dans mac/app :', FICHIERS.length, 'fichiers + vendor/');
