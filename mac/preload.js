// Pont entre la page de Patrimoine AI et le Mac : seules ces fonctions sont accessibles à la page.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');
let surProgres = null, surMaj = null, surVerrou = null, surCommande = null;
ipcRenderer.on('ia:progres', (e, p) => { if (surProgres) surProgres(p); });
ipcRenderer.on('maj:etat', (e, etat) => { if (surMaj) surMaj(etat); });
ipcRenderer.on('verrou', () => { if (surVerrou) surVerrou(); });
ipcRenderer.on('commande', (e, c) => { if (surCommande) surCommande(String(c)); });
contextBridge.exposeInMainWorld('patrimoineMac', {
  ia: {
    etat: () => ipcRenderer.invoke('ia:etat'),
    installer: cb => { surProgres = cb; return ipcRenderer.invoke('ia:installer'); },
    ecrire: msg => ipcRenderer.invoke('ia:ecrire', msg)
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
  cleCoffre: () => ipcRenderer.invoke('coffre:cle'),
  ouvrirDocument: (nom, octets) => ipcRenderer.invoke('coffre:ouvrir', nom, octets),
  connexionGoogle: () => ipcRenderer.invoke('google'),
  surVerrou: cb => { surVerrou = cb; },
  surCommande: cb => { surCommande = cb; }
});
