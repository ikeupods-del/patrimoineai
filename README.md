# Patrimoine AI

Suivi de patrimoine, marchés et assistant IA — **produit par QuenTools**.
Application web installable (PWA), sans serveur : tout tourne dans le navigateur et se sauvegarde sur votre GitHub.

**Adresse :** https://ikeupods-del.github.io/patrimoineai/

## Mise en ligne (une seule fois)
Settings → Pages → Source : **GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`.

## Utilisation
- **Connexion** : Réglages → « Se connecter avec GitHub ». L'app guide la création d'un jeton « gist » et demande une **phrase secrète**.
- **Synchronisation** entre appareils via un gist secret de votre compte, chiffré sur l'appareil (AES-256-GCM, PBKDF2) : ni GitHub ni QuenTools ne peuvent lire les données. Une copie par jour est gardée 30 jours (Réglages → « Sauvegardes GitHub »).
- **Cours en direct** (Yahoo Finance) via un relais CORS : relais publics par défaut ; pour plus de fiabilité, déployez `cors-worker/worker.js` sur Cloudflare Workers (gratuit) et renseignez `marketProxy` dans `config.js`.
- **IA** : locale sans clé, ou Gemini / Grok avec votre propre clé (gardée sur l'appareil).
- **Récupérer l'ancienne version Netlify** : exporter le JSON de l'ancienne app, puis « Restaurer une sauvegarde » dans la nouvelle.

## Fichiers
`index.html` (l'app), `config.js`, `manifest.webmanifest`, `sw.js`, icônes, `cors-worker/worker.js` (facultatif).
