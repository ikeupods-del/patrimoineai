// Pont entre la page de Patrimoine AI et le Mac : seules ces fonctions sont accessibles à la page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
let surProgres = null, surDictee = null, surMaj = null, surVerrou = null, surCommande = null;
ipcRenderer.on('ia:progres', (e, p) => { if (surProgres) surProgres(p); });
ipcRenderer.on('dictee:progres', (e, p) => { if (surDictee) surDictee(p); });
ipcRenderer.on('maj:etat', (e, etat) => { if (surMaj) surMaj(etat); });
ipcRenderer.on('verrou', () => { if (surVerrou) surVerrou(); });
ipcRenderer.on('commande', (e, c) => { if (surCommande) surCommande(String(c)); });
contextBridge.exposeInMainWorld('patrimoineMac', {
  // données chiffrées par le trousseau (liste fermée de clés, voir main.js) : lecture et écriture synchrones, comme le stockage du navigateur
  stockageSur: { tout: () => ipcRenderer.sendSync('stock:tout'), ecrire: (k, v) => ipcRenderer.sendSync('stock:ecrire', String(k), v == null ? null : String(v)) },
  ia: {
    etat: () => ipcRenderer.invoke('ia:etat'),
    installer: cb => { surProgres = cb; return ipcRenderer.invoke('ia:installer'); },
    ecrire: msg => ipcRenderer.invoke('ia:ecrire', msg)
  },
  dictee: {
    etat: () => ipcRenderer.invoke('dictee:etat'),
    micro: () => ipcRenderer.invoke('dictee:micro'),
    installer: cb => { surDictee = cb; return ipcRenderer.invoke('dictee:installer'); },
    ecouter: samples => ipcRenderer.invoke('dictee:ecouter', samples)
  },
  maj: {
    etat: () => ipcRenderer.invoke('maj:etat'),
    verifier: () => ipcRenderer.invoke('maj:verifier'),
    installer: () => ipcRenderer.invoke('maj:installer'),
    surChangement: cb => { surMaj = cb; }
  },
  sauvegarder: texte => ipcRenderer.invoke('sauv:ecrire', texte),
  etatSauvegardes: () => ipcRenderer.invoke('sauv:etat'),
  sauvegardes: () => ipcRenderer.invoke('sauv:liste'),
  lireSauvegarde: nom => ipcRenderer.invoke('sauv:lire', nom),
  ouvrirSauvegardes: () => ipcRenderer.invoke('sauv:ouvrir'),
  touchDispo: () => ipcRenderer.invoke('touch:dispo'),
  touchID: raison => ipcRenderer.invoke('touch:demander', raison),
  notifier: (titre, corps) => ipcRenderer.invoke('notif', titre, corps),
  pdf: (html, nom) => ipcRenderer.invoke('pdf', html, nom),
  barre: texte => ipcRenderer.invoke('barre', texte),
  badge: n => ipcRenderer.invoke('badge', n),
  demarrage: actif => ipcRenderer.invoke('demarrage', actif),
  cleCoffre: () => ipcRenderer.invoke('coffre:cle'),
  ouvrirDocument: (nom, octets) => ipcRenderer.invoke('coffre:ouvrir', nom, octets),
  connexionGoogle: () => ipcRenderer.invoke('google'),
  banque: {
    conf: () => ipcRenderer.invoke('banque:conf'),
    choisirCle: () => ipcRenderer.invoke('banque:cle'),
    demo: actif => ipcRenderer.invoke('banque:demo', actif),
    oublier: () => ipcRenderer.invoke('banque:oublier')
  },
  surVerrou: cb => { surVerrou = cb; },
  surCommande: cb => { surCommande = cb; }
});
