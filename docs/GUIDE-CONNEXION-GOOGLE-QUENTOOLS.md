# Guide QuenTools : connexion Google + sauvegarde chiffrée (à réutiliser dans chaque outil)

Testé et validé en production sur **Patrimoine AI** et **Infikit**. Aucun serveur, 100 % gratuit (Firebase Spark).

## Principe
- **Un seul projet Firebase pour tous les outils** : `quentools-adca1`. Même compte Google = même `uid` partout.
- Tous les outils sont sous `ikeupods-del.github.io` → même origine → la **session Google est partagée** (connecté dans un outil = connecté dans les autres, sans nouvelle fenêtre).
- **Chaque outil a son espace** dans Firestore : `users/{uid}/apps/{APP_ID}` (ex. `patrimoine`, `infikit`). Un nouvel outil = un nouvel `APP_ID`, rien d'autre à configurer.
- Les données sont **chiffrées sur l'appareil** (AES-GCM 256, clé PBKDF2 250 000 itérations SHA-256 dérivée d'une **phrase secrète** choisie par l'utilisateur) avant l'envoi : Google ne voit que du chiffré. Sans la phrase, la sauvegarde est irrécupérable (à dire à l'utilisateur).

## Configuration Firebase (déjà faite, ne pas refaire)
- Authentication → Google activé ; domaine autorisé `ikeupods-del.github.io`.
- Firestore créé, règles publiées (`firestore.rules` de ce dépôt) :
  `match /users/{uid}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }`
- Si un outil est hébergé sur **un autre domaine** : l'ajouter dans Authentication → Settings → Authorized domains.
- Config publique (mettre dans `config.js` de l'outil, ce n'est pas un secret) :
```js
firebase: { apiKey:"AIzaSyA-JS7hnSQXeNXnAPqbF3MV8rkPQ5_JVY8", authDomain:"quentools-adca1.firebaseapp.com",
  projectId:"quentools-adca1", storageBucket:"quentools-adca1.firebasestorage.app",
  messagingSenderId:"55024741286", appId:"1:55024741286:web:957475540e24ed223b7d67" }
```

## Recette pour un nouvel outil
1. Copier le bloc `/* --- Google (Firebase Auth) + Firestore ... */` de `index.html` de ce dépôt (Patrimoine AI) : fonctions `fb()`, `fbUser()`, `fbErr()`, `uref()`, `gsync()`, `googleLogin()`, `ghLoginDone()`, `idLoad()`, `ghLogout()`. Variante avec **pièces jointes découpées** : `fbFilePut/fbFileGet/fbFileDel` dans `Quentools/infikit/index.html`.
2. Changer `APP_ID` (unique par outil) et coller `firebase` dans son `config.js`.
3. SDK chargé à la demande en ESM depuis `https://www.gstatic.com/firebasejs/10.14.1/` (`firebase-app.js`, `firebase-auth.js`, `firebase-firestore.js`) via `import()`. **Précharger** (`fb()`) au démarrage : sinon le navigateur bloque la fenêtre Google (le clic n'est plus un « geste utilisateur » après un chargement réseau).
4. Connexion : si `auth.currentUser` existe (session d'un autre outil) → l'utiliser ; sinon `signInWithPopup(new GoogleAuthProvider())`. Puis demander la **phrase secrète** (2 saisies à la création, 1 si une sauvegarde existe déjà ; un déchiffrement qui échoue = mauvaise phrase → `signOut`).
5. Synchronisation avec **révision optimiste** : document `main` avec `rev` ; écriture par `runTransaction` qui vérifie que `rev` n'a pas bougé, sinon renvoyer un conflit et fusionner. Sauvegardes quotidiennes dans une sous-collection `backups/{AAAA-MM-JJ}`, 30 conservées.
6. Tests sans compte réel (Playwright) : intercepter les 3 fichiers `gstatic.com/firebasejs/**` avec de faux modules (auth en mémoire + Firestore en mémoire avec `getDoc/setDoc/getDocs/deleteDoc/runTransaction/writeBatch`).

## Limites à connaître
- Un document Firestore ≤ ~1 Mo : données principales ≤ ~900 Ko chiffrées ; au-delà (photos, PDF) → découper en morceaux de 900 000 caractères (docs `files/{id}.{n}`), lots de 8 max par `writeBatch`.
- Quota gratuit Spark : 1 Go stockés, 20 000 écritures/jour, 50 000 lectures/jour.
- Se déconnecter d'un outil déconnecte les autres (session partagée).
- La fenêtre Google peut être bloquée dans une PWA iPhone : demander d'autoriser les pop-ups.
- Chaque outil garde sa propre phrase secrète (rien n'est partagé entre outils côté chiffrement).
