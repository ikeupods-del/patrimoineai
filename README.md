# Patrimoine AI

Patrimoine, budget, objectifs, marchés en direct et assistant IA — **produit par QuenTools**.
Deux versions, un seul code : l'application web installable (téléphone, navigateur) et **l'application Mac** (dossier `mac/`).

**Adresse :** https://ikeupods-del.github.io/patrimoineai/
**Application Mac :** page « Releases » du dépôt, fichier `Patrimoine-AI-X.Y.Z-arm64.dmg` (Mac à puce Apple). Ouvrir le .dmg, glisser Patrimoine AI dans Applications ; au premier lancement : clic droit → Ouvrir. Les versions suivantes s'installent toutes seules.

## Fonctions
- **Patrimoine net** : placements (bourse, crowdlending, immobilier fractionné, assurance-vie, livrets, autres), **immobilier physique** (résidence, locatif, loyers) et **crédits** (capital restant dû recalculé chaque mois d'après le montant, le taux, la durée et la date de début ; saisie manuelle possible).
- **Budget** : revenus, dépenses fixes et courantes, mensualités de crédit reprises automatiquement, reste à vivre, taux d'épargne et d'endettement, et **combien investir chaque mois** (marge pour les imprévus, épargne de précaution, objectifs datés, puis long terme).
- **Objectifs** : montant, échéance, ce qui compte (patrimoine net, certains placements ou somme dédiée), effort mensuel nécessaire, état (en bonne voie, à accélérer), plan proposé par l'assistant.
- **Marchés** : cours en direct, favoris, **alertes de cours** (notification), graphique avec valeur au survol.
- **Analyse** : indice de fiabilité du crowdlending, points d'attention, **calendrier des remboursements**, **enveloppes** (PEA et son plafond, compte-titres…).
- **Simulateurs** : impôt, projection, avant d'investir, **répartition cible** (rééquilibrage par les versements), **crédit** (mensualité, coût, taux d'endettement).
- **Bilan patrimonial en PDF**, **recherche rapide** (⌘K / Ctrl K), import de contrats (lecteur PDF hébergé dans `vendor/pdfjs/`) et CSV.
- **Assistant** : IA locale (calculs, sans Internet), **IA du Mac** (application Mac : vrai modèle de langage sur la puce, sans Internet, chaque chiffre cité est vérifié dans les données, sinon la réponse calculée est affichée), Gemini ou Grok avec votre clé.

## Application Mac (`mac/`)
- Electron ; l'application web est copiée dans `mac/app` à la construction (`scripts/copier-app.js`) : **aucune copie à maintenir à la main**.
- En plus de la version web : cours Yahoo Finance **en direct sans relais** (l'origine des requêtes est présentée à Yahoo comme sa propre page), IA du Mac (modèle Qwen3 4B partagé avec QuentMovie, Studio Posts et Studio Sites dans `~/Movies/QuentMovie/modeles`, ~2,5 Go téléchargés une fois), **verrouillage Touch ID** (écran de confidentialité), **sauvegardes automatiques** (une par jour, 60 jours, dans `~/Library/Application Support/Patrimoine AI/Sauvegardes`), notifications du Mac, variation du jour dans la barre des menus, menus et raccourcis (⌘1 à ⌘8, ⌘N, ⌘K, ⌘P…), **mises à jour automatiques** (`maj.js`, copie adaptée de QuentMovie).
- **Connexion Google** dans l'application Mac : Google refuse les fenêtres de connexion intégrées, la connexion se fait donc dans le navigateur du Mac (`connexion-mac.html`, publiée avec le site) qui renvoie un jeton temporaire à l'application (adresse locale 127.0.0.1, code à usage unique). Cette page doit être en ligne : elle l'est dès que la branche est fusionnée sur `main`.
- **Publier une version** : changer `version` dans `mac/package.json` et ajouter sa section dans `mac/NOUVEAUTES.md`. Le workflow « Patrimoine AI — application Mac » construit le .dmg sur un vrai Mac, l'essaie (cours réels, flux en direct, bilan PDF, sauvegarde, vraie réponse de l'IA du Mac), puis le publie (étiquette `patrimoine-mac-vX.Y.Z`). Sans changement de version, rien n'est republié.
- Essai local : `cd mac && npm install && npm start`.

## Mise en ligne (une seule fois)
Settings → Pages → Source : **GitHub Actions**. Le workflow `.github/workflows/pages.yml` publie le site à chaque push sur `main`.

## Utilisation
- **Connexion** : Réglages → « Continuer avec Google ». Vous choisissez aussi une **phrase secrète** qui chiffre vos données.
- **Synchronisation** entre appareils via Firestore (`users/{uid}/apps/patrimoine`), chiffrée sur l'appareil (AES-256-GCM, PBKDF2) : ni Google ni QuenTools ne peuvent lire les données. Une copie par jour est gardée 30 jours (Réglages → « Sauvegardes »).
- **Cours en direct** : flux continus (WebSocket), sans clé ni serveur. Cryptos via Binance (temps réel), actions/ETF/indices/devises/matières via le flux Yahoo Finance (temps réel ou différé selon la place ; l'état est affiché sous chaque valeur). Moteur : `marches.js` (testé par `node tests/marches.test.js`), écran « Marchés », total du patrimoine et variation du jour mis à jour à chaque cours. Si un flux est muet, une interrogation rapide (≈ 12 s) prend le relais. Test navigateur : `node tests/e2e.js`.
- **Cours de secours** (Yahoo Finance) via un relais CORS : relais publics par défaut ; pour plus de fiabilité, déployez `cors-worker/worker.js` sur Cloudflare Workers (gratuit) et renseignez `marketProxy` dans `config.js`.
- **IA** : locale sans clé, ou Gemini / Grok avec votre propre clé (gardée sur l'appareil).
- **Récupérer l'ancienne version Netlify** : exporter le JSON de l'ancienne app, puis « Restaurer une sauvegarde » dans la nouvelle.

## Fichiers
`index.html` (l'app), `marches.js` (cours en direct), `connexion-mac.html` (connexion Google de l'application Mac), `vendor/pdfjs/` (lecteur PDF, licence Apache 2.0), `mac/` (application Mac), `tests/`, `config.js`, `manifest.webmanifest`, `sw.js`, icônes, `cors-worker/worker.js` (facultatif).

## Contrôles
`node tests/marches.test.js` (moteur de cours) et `node tests/e2e.js` (scénario navigateur : cours en direct, patrimoine net, budget, objectifs, assistant, recherche, bilan). Application Mac : le workflow l'essaie à chaque modification.

## Limites à connaître
- Montants immobiliers et capital restant dû : estimations (crédit amortissable à mensualités constantes) ; le tableau d'amortissement de la banque fait foi.
- Le plan « combien investir » et les objectifs supposent un rendement constant : ordre de grandeur, pas un conseil en investissement.
- Touch ID masque l'écran : ce n'est pas un chiffrement des données sur le Mac (elles restent dans la session macOS, comme toute application).
- L'IA du Mac est plus lente que l'IA locale (quelques secondes, davantage à la première question) et ne connaît que vos données et les calculs de l'application.


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
