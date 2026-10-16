# QuenTools : conventions communes
- Tout outil qui doit sauvegarder/synchroniser des données utilisateur utilise **Firebase (projet `quentools-adca1`)** : connexion Google + Firestore, données chiffrées côté navigateur. **Lire `docs/GUIDE-CONNEXION-GOOGLE-QUENTOOLS.md` avant de coder** (recette complète, config, limites).
- Chaque outil est une PWA statique sur GitHub Pages (workflow `.github/workflows/pages.yml`), avec la marque « Produit par QuenTools ».
- Répondre à l'utilisateur en français.

## Repères Patrimoine AI
- Une seule source pour le web et le Mac : `index.html` (+ `marches.js`, `calculs.js`, `config.js`, `vendor/`). L'application Mac (`mac/`, Electron) copie ces fichiers à la construction et ajoute le pont `window.patrimoineMac` (`mac/preload.js`) ; dans la page, `MAC` vaut ce pont (null dans le navigateur) : toute fonction propre au Mac se teste par `MAC`.
- Données : `D` (localStorage `pat_data`) ; catégories dans `CATS` (dont `bien` et `credit` : un crédit n'est jamais compté dans les actifs, `totals()` donne `tv` brut, `debt`, `net`, `fin`). Nouveaux champs : `D.budget`, `D.goals`, `D.alerts`, `D.target`, `D.ops` (opérations des relevés), `D.regles` (catégories apprises), `D.fire` (simulation retraite) ; tout champ synchronisé doit être ajouté à `SF`, `payload()` et `mergeRemote()`. Restent locaux : `D.fx` (taux de change), `D.docs` (métadonnées du coffre, fichiers chiffrés dans IndexedDB `patrimoine-coffre`).
- Calculs sans affichage dans `calculs.js` (`window.Calculs`, `CL` dans la page) : lecture des relevés, catégories, abonnements, TRI, Monte-Carlo, fiscalité, revenus passifs ; testés par `node tests/calculs.test.js`. Devises : `a.dev` (+ `a.fxm`), conversion par `tauxDev(a)` dans `val()`/`inv()`. Versements datés : `a.mv` (rendement réel `flux(a)`).
- Écrans : `renderX()` + section `v-x` + `NAV`/`TITLES` ; actions `ACT['nom']` via `data-act`. Ne jamais redessiner un écran pendant une saisie (`typing()`).
- IA du Mac : `macAnswer` (contrôle des chiffres `unknownNums`), modèle et code partagés avec Quentools (`mac/ia-locale.js`, `mac/ia-worker.js`, copies de `marketing/ia-locale/`).
- Avant de livrer : `node tests/marches.test.js`, `node tests/calculs.test.js` et `node tests/e2e.js` ; pour l'application Mac, nouvelle version = `mac/package.json` + `mac/NOUVEAUTES.md` (le workflow construit, essaie et publie).
