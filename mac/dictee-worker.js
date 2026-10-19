// Dictée de l'assistant : reconnaissance de la parole en français (Parakeet, sherpa-onnx), dans un processus à part.
// Même moteur et même modèle que QuentMovie (dépôt Quentools, quentmovie/parole-worker.js).
// Messages : { id, dossier, samples (Float32Array, 16 kHz mono) } → { id, ok, texte }.
'use strict';
const fs = require('fs');
const path = require('path');
const sherpa = require('sherpa-onnx-node');

let oreille = null, oreilleDossier = '';

function preparer(dossier) {
  if (oreille && oreilleDossier === dossier) return;
  const f = n => path.join(dossier, fs.readdirSync(dossier).find(x => x.startsWith(n) && x.endsWith('.onnx')) || n + '.onnx');
  oreille = new sherpa.OfflineRecognizer({
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: { transducer: { encoder: f('encoder'), decoder: f('decoder'), joiner: f('joiner') }, tokens: path.join(dossier, 'tokens.txt'), numThreads: 4, provider: 'cpu', debug: 0, modelType: 'nemo_transducer' },
    decodingMethod: 'greedy_search'
  });
  oreilleDossier = dossier;
}

function ecouter({ dossier, samples }) {
  preparer(dossier);
  const flux = oreille.createStream();
  flux.acceptWaveform({ samples: Float32Array.from(samples), sampleRate: 16000 });
  oreille.decode(flux);
  const r = oreille.getResult(flux);
  return { texte: String(r.text || (r.tokens || []).join('').replace(/▁/g, ' ')).replace(/\s+/g, ' ').trim() };
}

process.on('message', m => {
  try { process.send({ id: m.id, ok: true, ...ecouter(m) }); } catch (e) { process.send({ id: m.id, ok: false, erreur: String((e && e.message) || e) }); }
});
