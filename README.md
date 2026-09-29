# Patrimoine AI

Suivi de patrimoine, marchés et assistant IA — **produit par QuenTools**.
Application web installable (PWA), sans serveur : tout tourne dans le navigateur ; connexion Google et sauvegarde chiffrée via Firebase (gratuit).

**Adresse :** https://ikeupods-del.github.io/patrimoineai/

## Mise en ligne (une seule fois)
Settings → Pages → Source : **GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`.

## Utilisation
- **Connexion** : Réglages → « Continuer avec Google ». Vous choisissez aussi une **phrase secrète** qui chiffre vos données.
- **Synchronisation** entre appareils via Firestore (`users/{uid}/apps/patrimoine`), chiffrée sur l'appareil (AES-256-GCM, PBKDF2) : ni Google ni QuenTools ne peuvent lire les données. Une copie par jour est gardée 30 jours (Réglages → « Sauvegardes »).
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

## Un seul compte Google pour toutes les apps QuenTools
- Toutes les apps utilisent le **même projet Firebase** (`quentools-adca1`) : un même compte Google = le même `uid` partout.
- Les apps hébergées sous `ikeupods-del.github.io` partagent aussi la session : connecté dans l'une, vous l'êtes dans les autres.
- Chaque app range ses données dans **son propre espace** `users/{uid}/apps/{idApp}` (ici `patrimoine`) ; les règles `firestore.rules` couvrent tout `users/{uid}/**`, sans rien changer pour une nouvelle app.
- Nouvelle app : reprendre le bloc « Google (Firebase Auth) + Firestore » de `index.html`, copier `firebase` dans son `config.js` et choisir un `APP_ID` unique. Autre domaine (ex. domaine perso) : l'ajouter dans Authentication → Authorized domains.
