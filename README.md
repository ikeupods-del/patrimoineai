# Patrimoine AI

Patrimoine, budget, objectifs, marchés en direct et assistant IA — **produit par QuenTools**.
Deux versions, un seul code : l'application web installable (téléphone, navigateur) et **l'application Mac** (dossier `mac/`).

**Adresse :** https://ikeupods-del.github.io/patrimoineai/
**Application Mac :** page « Releases » du dépôt, fichier `Patrimoine-AI-X.Y.Z-arm64.dmg` (Mac à puce Apple). Ouvrir le .dmg, glisser Patrimoine AI dans Applications ; au premier lancement : clic droit → Ouvrir. Les versions suivantes s'installent toutes seules.

## Fonctions
- **Patrimoine net** : placements (bourse, crowdlending, immobilier fractionné, assurance-vie, livrets, autres), **immobilier physique** (résidence, locatif, loyers) et **crédits** (capital restant dû recalculé chaque mois d'après le montant, le taux, la durée et la date de début ; saisie manuelle possible).
- **Budget** : revenus, dépenses fixes et courantes, mensualités de crédit reprises automatiquement, reste à vivre, taux d'épargne et d'endettement, et **combien investir chaque mois** (marge pour les imprévus, épargne de précaution, objectifs datés, puis long terme).
- **Budget réel** : import des relevés bancaires (CSV des banques françaises, OFX, QFX, QIF ; encodage Windows reconnu, sans doublon d'un import à l'autre), chaque opération classée par catégorie (règles par mots-clés, puis vos corrections retenues par libellé), **prévu contre réel** mois par mois avec les dépassements, **abonnements et prélèvements réguliers** repérés (coût par an), budget prérempli avec les moyennes réelles. Seuls la date, le libellé et le montant sont gardés (25 mois au plus).
- **Objectifs** : montant, échéance, ce qui compte (patrimoine net, certains placements ou somme dédiée), effort mensuel nécessaire, état (en bonne voie, à accélérer), plan proposé par l'assistant.
- **Actualités** : actualité économique en français (Google Actualités), par thème, par région ou sur un sujet libre, avec un thème « Mes placements » ; derniers titres sur l'accueil et dans la fiche de chaque valeur. Seuls les mots du thème (et, pour « Mes placements », le nom des valeurs suivies) sont envoyés à Google. Version web : flux lu par les relais (`cors-worker/worker.js` l'accepte aussi) ; application Mac : lecture directe.
- **Marchés** : cours en direct, favoris, **alertes de cours** (notification), graphique avec valeur au survol.
- **Analyse** : indice de fiabilité du crowdlending, points d'attention, **rendement réel** (taux de rendement interne d'après les versements datés, comparé au Livret A et à un ETF MSCI World avec les mêmes sommes aux mêmes dates ; coût des frais de gestion sur 20 ans), **revenus passifs sur 12 mois** (loyers, dividendes d'après les 12 derniers mois Yahoo ou saisis, intérêts des projets et des livrets), **calendrier des remboursements**, **enveloppes** (PEA et son plafond, compte-titres…).
- **Devises** : comptes, épargne, biens et projets tenus en dollars, livres, francs suisses… convertis en euros au cours du jour (ou à un taux saisi, parité fixe pour le franc CFA).
- **Simulateurs** : impôt, projection, **retraite et indépendance financière** (capital à réunir, trois scénarios, probabilité par 2 000 tirages), **vente d'un placement** (PFU, PEA, assurance-vie, PER, plus-value immobilière avec abattements et surtaxe), **succession, donation et IFI**, avant d'investir, **répartition cible** (rééquilibrage par les versements), **crédit** (mensualité, coût, taux d'endettement).
- **Coffre à documents** : contrats, relevés, avis d'imposition rangés avec chaque placement, chiffrés en AES-256 sur l'appareil (IndexedDB ; sur le Mac, clé protégée par le trousseau), jamais synchronisés.
- **Résumé du mois** : le mois écoulé (patrimoine, dépenses réelles, dépassements) sur l'accueil, et en notification sur le Mac.
- **Mes banques** : compte Boursorama relié par Enable Banking (open banking DSP2, lecture seule, 90 jours renouvelables) ; soldes comptés dans le patrimoine, opérations du compte courant classées dans le budget réel. La liaison se fait **dans l'application Mac, sans serveur** : la clé de l'application Enable Banking et la session restent sur le Mac (trousseau) ; la version en ligne reçoit soldes et opérations par la synchronisation. Mise en route : [`docs/BANQUE.md`](docs/BANQUE.md).
- **Rappels de paiement** : Bricks le 8, BienPrêter le 5 (modifiables) ; le jour J, « Paiement reçu ? Oui / Non / Montant différent », en retard après 3 jours, paiement inscrit dans l'historique du placement et ajouté au patrimoine, rapprochement avec les opérations de la banque liée, week-ends et jours fériés décalés au jour ouvré, retrait vers la banque détecté (pas de double compte), calendrier `.ics` pour être prévenu application fermée.
- **Bilan patrimonial en PDF**, **recherche rapide** (⌘K / Ctrl K), import de contrats (lecteur PDF hébergé dans `vendor/pdfjs/`) et CSV.
- **Assistant** : IA locale (calculs, sans Internet), **IA du Mac** (application Mac : vrai modèle de langage sur la puce, sans Internet, chaque chiffre cité est vérifié dans les données, sinon la réponse calculée est affichée), Gemini ou Grok avec votre clé.

## Application Mac (`mac/`)
- Electron ; l'application web est copiée dans `mac/app` à la construction (`scripts/copier-app.js`) : **aucune copie à maintenir à la main**.
- En plus de la version web : cours Yahoo Finance **en direct sans relais** (l'origine des requêtes est présentée à Yahoo comme sa propre page), IA du Mac (modèle Qwen3 4B partagé avec QuentMovie, Studio Posts et Studio Sites dans `~/Movies/QuentMovie/modeles`, ~2,5 Go téléchargés une fois), **verrouillage Touch ID** (écran de confidentialité ; délai d'inactivité de 1 à 30 minutes ; montant masqué dans la barre des menus pendant le verrouillage), **sauvegardes automatiques** (une par jour, 60 jours, dans `~/Library/Application Support/Patrimoine AI/Sauvegardes`), notifications du Mac (dont le résumé du mois), **fenêtre fermée = application en arrière-plan** (⌘W cache, ⌘Q quitte : barre des menus, rappels, alertes de cours et résumé du mois continuent ; flux de cours gardé ouvert si une alerte ou la barre des menus en a besoin), ouverture à l'ouverture de session, pastille du Dock (paiements à confirmer), menus du Dock et de la barre des menus, reprise après la veille, **patrimoine net ou variation du jour dans la barre des menus**, coffre à documents chiffré avec une clé gardée par le trousseau (documents ouverts dans Aperçu depuis un dossier temporaire effacé après 10 minutes), menus et raccourcis (⌘1 à ⌘8, ⌘N, ⌘K, ⌘P…), **mises à jour automatiques** (`maj.js`, copie de `quentmovie/maj.js` avec le dépôt réglable : version du .dmg vérifiée, aucun remplacement tant que l'application est ouverte, ancienne version gardée jusqu'au démarrage suivant), fenêtre replacée sur un écran visible.
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
`index.html` (l'app), `marches.js` (cours en direct), `calculs.js` (relevés bancaires, catégories, abonnements, rendement réel, retraite, fiscalité, revenus passifs : fonctions sans affichage), `connexion-mac.html` (connexion Google de l'application Mac), `vendor/pdfjs/` (lecteur PDF, licence Apache 2.0), `mac/` (application Mac), `tests/`, `config.js`, `manifest.webmanifest`, `sw.js`, icônes, `cors-worker/worker.js` (facultatif), `banque/` (liaison bancaire : routes exécutées par `mac/banque-locale.js`), `docs/BANQUE.md`.

## Contrôles
`node tests/marches.test.js` (moteur de cours), `node tests/calculs.test.js` (relevés de plusieurs banques, catégories, abonnements, TRI, simulation, barèmes fiscaux, rappels de paiement), `node tests/banque.test.js` (fonctions bancaires : jeton Enable Banking, state, chiffrement, cache, pagination, erreurs), `node tests/banque-e2e.js`, `node tests/banque-mac.js` (liaison bancaire de l'application Mac, banque de démonstration) (Mes banques et rappels dans le navigateur, banque de démonstration, accessibilité avec `AXE=…`) et `node tests/e2e.js` (scénario navigateur : cours en direct, patrimoine net, budget, relevés, prévu contre réel, rendement, devises, revenus passifs, simulateurs, résumé du mois, coffre, objectifs, assistant, recherche, bilan). Application Mac : le workflow l'essaie à chaque modification.

## Limites à connaître
- Montants immobiliers et capital restant dû : estimations (crédit amortissable à mensualités constantes) ; le tableau d'amortissement de la banque fait foi.
- Le plan « combien investir » et les objectifs supposent un rendement constant : ordre de grandeur, pas un conseil en investissement.
- Touch ID masque l'écran : ce n'est pas un chiffrement des données sur le Mac (elles restent dans la session macOS, comme toute application).
- Relevés : le classement automatique se trompe parfois (libellés propres à chaque banque) ; corrigez une opération, la règle est retenue. Le format PDF n'est pas lu : exportez en CSV, OFX ou QIF.
- Fiscalité, succession et IFI : règles 2026 simplifiées (hors démembrement, régime matrimonial, testament, cas particuliers) ; un notaire ou un conseiller fiscal fait foi. Le taux du Livret A retenu pour la comparaison se modifie dans la carte « Rendement réel ».
- Simulation de la retraite : rendements réels hypothétiques, ce n'est pas une prévision.
- Coffre à documents : les fichiers restent sur l'appareil où ils ont été ajoutés (ni synchronisés, ni dans les sauvegardes JSON) ; gardez les originaux ailleurs. Dans le navigateur, effacer les données du site efface aussi le coffre.
- Liaison bancaire : comptes de paiement seulement (pas de PEA ni de compte-titres, que la DSP2 ne couvre pas) ; accord de 90 jours à renouveler ; voir les autres limites dans `docs/BANQUE.md`.
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
