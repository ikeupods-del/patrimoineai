// QuentMovie : IA locale (modèle de langage sur la puce du Mac, node-llama-cpp), dans un processus à part.
// Sert au générateur : réécrire en script de vidéo les faits tirés de Wikipédia, sans rien inventer.
// Messages : { id, type: 'ecrire', modele, systeme, demande, schema, maxTokens } → { id, ok, resultat }.
'use strict';
let llama = null, modele = null, chemin = '', lib = null;

async function charger(fichier) {
  if (modele && chemin === fichier) return;
  lib = lib || await import('node-llama-cpp');
  llama = llama || await lib.getLlama({ build: 'never', gpu: 'auto' });
  if (modele) await modele.dispose();
  modele = await llama.loadModel({ modelPath: fichier });
  chemin = fichier;
}

async function ecrire({ modele: fichier, systeme, demande, schema, maxTokens = 2500, temperature = 0.6, contexte = 8192 }) {
  await charger(fichier);
  const ctx = await modele.createContext({ contextSize: contexte });
  try {
    const session = new lib.LlamaChatSession({ contextSequence: ctx.getSequence(), systemPrompt: systeme });
    const grammaire = schema ? await llama.createGrammarForJsonSchema(schema) : undefined;
    const t = await session.prompt(demande, { grammar: grammaire, maxTokens, temperature });
    return { resultat: grammaire ? grammaire.parse(t) : t, gpu: llama.gpu };
  } finally { await ctx.dispose(); }
}

process.on('message', async m => {
  try { process.send({ id: m.id, ok: true, ...(m.type === 'ecrire' ? await ecrire(m) : { pong: true }) }); }
  catch (e) { process.send({ id: m.id, ok: false, erreur: String((e && e.message) || e) }); }
});
process.send({ pret: true });
