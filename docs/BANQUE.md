# Liaison bancaire (Enable Banking) et rappels de paiement

## Ce que ça fait
- **Mes banques** (menu Patrimoine, ou « Plus » sur téléphone) : relie votre compte Boursorama (BoursoBank) par **Enable Banking**, prestataire agréé d'accès aux comptes (open banking DSP2). Vous vous identifiez **sur le site de la banque**, jamais dans Patrimoine AI. L'accès est **en lecture seule** et dure **90 jours** au plus (règle de la DSP2), puis se renouvelle en une minute.
- Les **soldes** des comptes liés entrent dans le patrimoine (Livrets et liquidités), avec la date de dernière synchronisation. Un interrupteur par compte permet de ne pas le compter.
- Les **opérations du compte courant** (90 derniers jours au premier passage) sont classées comme un relevé importé : elles alimentent le budget réel, les dépassements et les abonnements repérés. Les opérations en attente sont ignorées ; une opération déjà importée par un relevé CSV (même jour, même montant) n'est pas reprise.
- **PEA et compte-titres** : l'open banking ne couvre que les comptes de paiement. S'ils n'apparaissent pas dans les comptes liés, c'est que la banque ne les transmet pas : leurs positions se suivent à la main (type Bourse, avec le ticker) ou par import CSV. Rien n'est inventé.
- **Rappels de paiement** : Bricks le 8 et BienPrêter le 5 de chaque mois (modifiables, d'autres peuvent être ajoutés). Le jour J, l'accueil demande « Paiement reçu ? **Oui / Non / Montant différent** », avec une notification du navigateur si vous l'avez autorisée (notification du Mac dans l'application Mac). Sans réponse au bout de **3 jours**, le paiement passe **en retard** (et apparaît dans « À surveiller »).
  - **Oui** (ou **Montant différent**) : le paiement est inscrit dans l'historique du placement concerné (fiche du placement → « Paiements reçus »), compte dans son rendement réel, et la somme est ajoutée au patrimoine : par défaut dans un compte « Portefeuille Bricks » / « Portefeuille BienPrêter » (là où les plateformes versent l'argent) ; au choix sur un autre compte, ou nulle part. Une part de **capital remboursé** (prêts BienPrêter) peut être indiquée : elle réduit le montant encore investi.
  - **Non** : « pas encore reçu » (le rappel reste affiché) ou « pas de paiement ce mois-ci » (le rappel du mois est fermé).
  - **Jours ouvrés** : un paiement prévu un samedi, un dimanche ou un jour férié (Pâques, Ascension, Pentecôte, 14 juillet, 11 novembre…) est attendu le jour ouvré suivant. Décochez « Décaler au jour ouvré » dans le rappel pour désactiver ce comportement.
  - **Montant habituel** : sans montant saisi, l'application retient la médiane de vos trois derniers paiements ; un seul « Oui » suffit alors à confirmer.
  - **Application fermée** : le serveur ne peut pas lire vos rappels (vos données sont chiffrées sur votre appareil avec votre phrase secrète). Pour être prévenu même téléphone fermé, touchez **« Ajouter au calendrier »** (écran Mes banques) : un fichier `.ics` crée un événement mensuel avec alarme dans Google Agenda, Apple Calendrier ou Outlook. Même principe pour le renouvellement de l'accord bancaire (« Rappel au calendrier », une semaine avant l'expiration).
  - **Banque liée** : le virement correspondant est cherché sur le compte (mot du libellé, par exemple BRICKS ou BIENPRETER|LEMONWAY, entre 3 jours avant et 10 jours après la date). L'application propose « Valider avec cette opération » ; la validation manuelle reste possible. Un paiement validé avec une opération de la banque n'est pas ajouté une seconde fois : il est déjà dans le solde synchronisé.
- **Pas de double compte avec les plateformes** : quand une plateforme verse l'argent dans son « Portefeuille » puis que vous le virez sur Boursorama, l'application repère le virement sur votre compte (libellé de la plateforme) et propose **« Retirer du portefeuille »** (carte « Retrait à confirmer » sur l'accueil et dans Mes banques). Oui : le portefeuille baisse de la somme virée ; Non : l'opération est ignorée pour toujours. Annulable.
- **Comptes d'épargne** : par défaut seul le solde d'un livret est lu. L'interrupteur « Importer aussi ses opérations » les ajoute ; elles restent neutres dans le budget (un virement vers le livret est déjà compté « mis de côté ») et les intérêts comptent en revenu.
- **Relevés CSV et banque ensemble** : une opération reçue par les deux est comptée une seule fois (même montant, à deux jours près ; deux achats identiques le même jour restent deux opérations).

## Comment c'est protégé
- La **clé privée** de l'application Enable Banking et son identifiant ne sont **jamais** dans la page ni dans le dépôt : uniquement dans les variables d'environnement Netlify, lues par les fonctions `netlify/functions/banque-*.mjs`.
- Chaque appel exige votre **connexion Google** (la même que la synchronisation) : le jeton est vérifié par le serveur avec les clés publiques de Google. Vous pouvez en plus réserver l'accès à votre seule adresse (`ENABLE_ALLOWED_EMAILS`).
- La **session bancaire** est gardée dans votre compte Firestore (`users/{uid}/apps/patrimoine/banque/etat`, mêmes règles que la synchronisation), **chiffrée par le serveur** (AES-256-GCM) : ni la page ni Google ne peuvent la lire. Aucun identifiant ni mot de passe bancaire n'est jamais stocké ; l'IBAN n'est conservé que par ses 4 derniers chiffres.
- Le « state » de la connexion est aléatoire, gardé côté serveur, vérifié au retour, valable 30 minutes et utilisable une seule fois.
- Pas de consultation en boucle : soldes gardés 10 minutes (1 minute quand vous touchez « Synchroniser »), synchronisation automatique au plus toutes les 6 heures à l'ouverture, 300 appels par jour au plus. Votre adresse IP et votre navigateur sont transmis à la banque (en-têtes `Psu-Ip-Address`, `Psu-User-Agent`) : une consultation faite en votre présence échappe à la limite de 4 accès par jour de la DSP2.

## Variables d'environnement Netlify
Netlify → votre site → **Site configuration → Environment variables** (portée : Functions).

| Variable | Obligatoire | Contenu |
|---|---|---|
| `ENABLE_APP_ID` | oui | Identifiant de l'application Enable Banking (le nom du fichier `.pem` téléchargé, sans `.pem`). |
| `ENABLE_PRIVATE_KEY` | oui | Contenu **complet** du fichier `.pem` (de `-----BEGIN PRIVATE KEY-----` à `-----END PRIVATE KEY-----`). Collé tel quel, ou sur une ligne avec des `\n`, ou encodé en base64. |
| `ENABLE_REDIRECT_URL` | oui | Adresse de l'application où revenir après la banque, **identique** à celle déclarée dans Enable Banking. Ex. `https://ikeupods-del.github.io/patrimoineai/` (ou l'adresse du site Netlify). |
| `ENABLE_ALLOWED_EMAILS` | conseillé | Votre adresse Gmail : personne d'autre ne peut utiliser la liaison. Plusieurs adresses : séparées par des virgules. |
| `ENABLE_ALLOWED_ORIGINS` | non | Sites autorisés à appeler les fonctions. Par défaut `https://ikeupods-del.github.io,app://patrimoine` (version en ligne et application Mac) ; le site Netlify lui-même est toujours autorisé. |
| `ENABLE_ASPSP_NAME` / `ENABLE_ASPSP_COUNTRY` | non | Banque visée. Par défaut : la banque française dont le nom contient « Bourso ». Pour la banque de test du sandbox : son nom exact tel qu'il apparaît dans la liste d'Enable Banking, et son pays. |
| `ENABLE_STORE_KEY` | non | Clé de chiffrement de la session (texte long et aléatoire). Par défaut, elle est dérivée de la clé privée. |
| `ENABLE_MOCK` | non | `1` = **banque de démonstration** : tout le parcours sans Enable Banking ni vraie banque (comptes et opérations fictifs, signalés « Démonstration »). **Ignoré dès que `ENABLE_APP_ID` et `ENABLE_PRIVATE_KEY` sont renseignées** (l'application et le test de configuration vous le signalent) : un oubli ne masque jamais la vraie banque. |
| `FIREBASE_PROJECT_ID` | non | `quentools-adca1` par défaut. |

Attention : Netlify limite l'ensemble des variables des fonctions à environ 4 Ko. Une clé RSA de 2048 bits tient sans problème ; si le déploiement se plaint de la taille, retirez les variables inutiles.

## Mise en route, pas à pas
1. **Netlify** : *Add new site → Import an existing project → GitHub → ikeupods-del/patrimoineai*. Le fichier `netlify.toml` fait le reste (site dans `_site`, fonctions dans `netlify/functions`). Notez l'adresse du site (ex. `https://patrimoine-ai.netlify.app`).
2. **Essai sans banque** : ajoutez `ENABLE_MOCK = 1` et `ENABLE_REDIRECT_URL` (l'adresse de l'application), puis redéployez (*Deploys → Trigger deploy*).
3. **Adresse du serveur dans l'application** : dans `config.js`, `banqueApi: 'https://patrimoine-ai.netlify.app'` (indispensable pour la version GitHub Pages et l'application Mac ; inutile si vous utilisez directement le site Netlify). Si vous ouvrez l'application depuis l'adresse Netlify, ajoutez ce domaine dans Firebase → Authentication → Settings → **Authorized domains**, sinon la connexion Google sera refusée.
4. Ouvrez **Mes banques** → **Tester la configuration** : une liste de vérifications (variables, clé, application Enable Banking, adresse de retour identique à celle déclarée, banque trouvée, stockage) dit précisément ce qui manque. Puis **Lier ma banque** : en démonstration, vous revenez aussitôt avec deux comptes fictifs. Vérifiez soldes, opérations, rappels.
5. **Enable Banking** : créez un compte sur enablebanking.com, puis dans le **Control Panel → Applications**, enregistrez une application :
   - environnement **Sandbox** d'abord (essai avec la banque de test), puis **Production** ;
   - **Redirect URL** : exactement la valeur de `ENABLE_REDIRECT_URL` ;
   - choisissez « générer la clé dans le navigateur » : un fichier `xxxxxxxx-xxxx-….pem` est téléchargé. Son nom (sans `.pem`) est `ENABLE_APP_ID`, son contenu est `ENABLE_PRIVATE_KEY`. Gardez-le en lieu sûr, ne l'envoyez à personne, ne le mettez jamais dans le dépôt.
6. **Sandbox** : renseignez `ENABLE_APP_ID`, `ENABLE_PRIVATE_KEY` (application sandbox), `ENABLE_ASPSP_NAME` et `ENABLE_ASPSP_COUNTRY` (banque de test), retirez `ENABLE_MOCK`, redéployez, liez la banque de test avec les identifiants de test indiqués par Enable Banking.
7. **Production, usage personnel (« Restricted Production »)** : dans le Control Panel, passez l'application en production restreinte et **liez vos propres comptes** en suivant les écrans d'Enable Banking (en mode restreint, seuls les comptes liés là sont accessibles). Remplacez `ENABLE_APP_ID` / `ENABLE_PRIVATE_KEY` par ceux de l'application de production, retirez `ENABLE_ASPSP_NAME` / `ENABLE_ASPSP_COUNTRY` (Boursorama est trouvée toute seule), ajoutez `ENABLE_ALLOWED_EMAILS`, redéployez.
8. Dans l'application : **Mes banques → Tester la configuration** (tout doit être au vert), puis **Lier ma banque** → identification sur Boursorama → retour automatique, soldes et opérations importés. Tous les 90 jours : **Renouveler** (l'application prévient 14 jours avant ; « Rappel au calendrier » ajoute une alarme).
9. Si la synchronisation échoue plus de 3 jours, « À surveiller » l'indique avec le dernier message. Les erreurs côté serveur (code et statut, jamais de montant ni de compte) sont dans Netlify → *Logs → Functions*.

## Limites à connaître
- Les noms des champs viennent de la documentation et des exemples officiels d'Enable Banking ; si Enable Banking change son API, un message clair s'affiche (« Enable Banking a refusé la demande… »).
- iPhone, application installée sur l'écran d'accueil : iOS peut terminer la connexion bancaire dans Safari. Si vous n'y êtes pas encore connecté à Google, le retour de la banque est gardé : connectez-vous (Réglages) et la liaison se termine toute seule. La banque est liée à votre compte, l'application installée la retrouve ensuite.
- Application Mac : la connexion à la banque s'ouvre dans le navigateur et se termine sur la version en ligne ; l'application Mac détecte la fin de la liaison toute seule (relecture toutes les 4 secondes, 10 minutes au plus) et se met à jour. Un retour direct dans l'application, sans passer par la version en ligne, demanderait une adresse de retour locale acceptée par Enable Banking : non vérifié.
- Une modification à la main du solde d'un compte lié est remplacée à la synchronisation suivante.
- Les sommes versées dans un « Portefeuille » de plateforme restent comptées jusqu'à ce que vous confirmiez le retrait (proposé automatiquement quand le virement arrive sur le compte lié ; à la main sinon, en modifiant le portefeuille).
- Sans banque liée, ou si la plateforme utilise un libellé inattendu, le retrait n'est pas détecté : indiquez le mot du libellé dans le rappel.
- Le rapprochement se fait sur le libellé : si la plateforme change de libellé, indiquez le nouveau mot dans le rappel.

## Contrôles
- `node tests/banque.test.js` : fonctions (jeton JWT, state, chiffrement, cache, pagination, expiration, erreurs, diagnostic, démonstration).
- `node tests/banque-e2e.js` : parcours complet dans le navigateur (liaison, soldes, rappels, retraits, calendrier, doublons, épargne, échecs, rendement vérifié sur des prêts à 7 % dont le résultat est connu). Avec `AXE=/chemin/axe.min.js` : audit d'accessibilité WCAG AA (axe-core) en thèmes clair et sombre.
- `node tests/calculs.test.js` : calculs des rappels (jours ouvrés, fériés, retraits, doublons, calendrier).
- Sur GitHub : `.github/workflows/tests.yml` lance tout à chaque modification ; la publication sur GitHub Pages attend les contrôles rapides.
