# Patrimoine AI

Suivi de patrimoine, marchés et assistant IA — **produit par QuenTools**.
Application web installable (PWA), sans serveur : tout tourne dans le navigateur ; connexion Google et sauvegarde chiffrée via Firebase (gratuit).

**Adresse :** https://ikeupods-del.github.io/patrimoineai/

## Mise en ligne (une seule fois)
Settings → Pages → Source : **GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`.

## Utilisation
- **Connexion** : Réglages → « Continuer avec Google ». Vous choisissez aussi une **phrase secrète** qui chiffre vos données.
- **Synchronisation** entre appareils via Firestore (`users/{uid}`), chiffrée sur l'appareil (AES-256-GCM, PBKDF2) : ni Google ni QuenTools ne peuvent lire les données. Une copie par jour est gardée 30 jours (Réglages → « Sauvegardes »).
- **Cours en direct** (Yahoo Finance) via un relais CORS : relais publics par défaut ; pour plus de fiabilité, déployez `cors-worker/worker.js` sur Cloudflare Workers (gratuit) et renseignez `marketProxy` dans `config.js`.
- **IA** : locale sans clé, ou Gemini / Grok avec votre propre clé (gardée sur l'appareil).
- **Récupérer l'ancienne version Netlify** : exporter le JSON de l'ancienne app, puis « Restaurer une sauvegarde » dans la nouvelle.

## Fichiers
`index.html` (l'app), `config.js`, `manifest.webmanifest`, `sw.js`, icônes, `cors-worker/worker.js` (facultatif).


## Configuration Firebase (une seule fois)
Projet : `quentools-adca1` (config publique dans `config.js`).
1. **Authentication → Sign-in method** : activer **Google**.
2. **Authentication → Settings → Authorized domains** : ajouter `ikeupods-del.github.io`.
3. **Firestore Database** : créer la base (mode production), puis onglet **Rules** : coller le contenu de `firestore.rules` et **Publier**.
