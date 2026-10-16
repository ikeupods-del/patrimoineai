/* Patrimoine AI — réglages (produit par QuenTools). Tout est facultatif : l'app fonctionne sans rien renseigner. */
window.PATRIMOINE_CONFIG = {
  // Firebase (connexion Google + sauvegarde chiffrée). Ces clés sont publiques par conception : la sécurité vient des règles Firestore (firestore.rules).
  firebase: {
    apiKey: "AIzaSyA-JS7hnSQXeNXnAPqbF3MV8rkPQ5_JVY8",
    authDomain: "quentools-adca1.firebaseapp.com",
    projectId: "quentools-adca1",
    storageBucket: "quentools-adca1.firebasestorage.app",
    messagingSenderId: "55024741286",
    appId: "1:55024741286:web:957475540e24ed223b7d67"
  },
  // Relais CORS personnel pour les cours Yahoo Finance (voir cors-worker/worker.js, Cloudflare Workers gratuit).
  // Vide = relais publics (corsproxy.io, allorigins), parfois lents ou indisponibles.
  marketProxy: '', // ex. https://patrimoine-cors.votre-nom.workers.dev
  // Liaison bancaire (écran « Mes banques ») : adresse du site Netlify qui héberge les fonctions netlify/functions (voir docs/BANQUE.md).
  // Vide = le site lui-même s'il est hébergé sur Netlify ; sur GitHub Pages et dans l'application Mac, l'adresse est nécessaire.
  banqueApi: '', // ex. https://patrimoine-ai.netlify.app
};
