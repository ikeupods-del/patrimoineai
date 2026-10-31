# Notifications push des rappels de versement (facultatif)

## Ce que ça fait
Le jour d'un versement attendu (BienPrêter le 5, Bricks le 8…), puis 3 et 10 jours après s'il n'est pas confirmé, votre téléphone ou votre ordinateur reçoit une notification **même application fermée**. Un toucher ouvre l'accueil, où le versement se confirme.

Sans cette option, l'application prévient déjà : à l'ouverture, par une notification du navigateur ; sur Chrome ou Edge, l'application installée vérifie elle-même en arrière-plan quand le navigateur le permet ; et le fichier calendrier (« Ajouter au calendrier ») sonne chaque mois. Le push ajoute la garantie d'être prévenu chaque matin.

## Ce que ça implique (à lire avant d'activer)
- **Un serveur** : le push demande qu'un serveur envoie un signal chaque matin. Il tourne sur **Netlify** (fonction planifiée `netlify/functions/rappels-push.mjs`, 6 h 17 UTC), avec le même hébergement facultatif que la liaison bancaire (docs/BANQUE.md, « Netlify »). Offre gratuite suffisante pour un usage personnel (à vérifier sur netlify.com).
- **Ce que le serveur reçoit**, et rien d'autre : l'adresse d'envoi de votre navigateur (fournie par Google, Mozilla ou Apple), les **jours du mois** de vos rappels (par exemple 5 et 8) et les **dates** de versements encore à confirmer. Ni montant, ni nom de plateforme, ni patrimoine. Ces données sont rangées sous votre compte Google vérifié, chiffrées, dans Netlify Blobs.
- **La notification part vide** : le texte (« Versement attendu : BienPrêter ») est écrit par votre appareil d'après les dates qu'il garde lui-même. Le service de notification (Google, Mozilla, Apple) ne voit donc aucun contenu.
- **Deux clés VAPID** (une publique, une privée) identifient votre serveur auprès des services de notification. Elles se gardent dans les variables de Netlify, jamais dans le dépôt.
- **iPhone** : les notifications push ne marchent que pour l'application installée sur l'écran d'accueil (Safari → Partager → Sur l'écran d'accueil), iOS 16.4 ou plus récent. **Mac** : l'application Mac a ses propres notifications, l'option ne la concerne pas.
- Le serveur ne sait pas quand vous confirmez un versement tant que l'application n'a pas renvoyé ses dates (elle le fait à chaque modification, quand elle est ouverte) : au pire, une notification de rappel de trop.

## Mise en route (une fois)
1. L'hébergement Netlify doit être en place (docs/BANQUE.md, « Netlify », étapes 1 et 4).
2. Générez les clés : `node push/cles-vapid.mjs` (sur n'importe quel ordinateur avec Node.js).
3. Netlify → Site configuration → **Environment variables** : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` (`mailto:` suivi de votre adresse). Redéployez.
4. Dans l'application (ouverte depuis le site Netlify, connectée avec Google) : **Mes banques → Rappels de paiement → « Prévenir même application fermée »**, puis autorisez les notifications.
Pour arrêter : décochez l'interrupteur (l'abonnement est effacé du serveur). Un abonnement que le navigateur a supprimé est effacé automatiquement au premier envoi refusé.

## Fichiers
`push/push.mjs` (jeton VAPID, jours à prévenir, envoi, tournée), `push/routes/cle.mjs` et `push/routes/abonnement.mjs` (compte Google vérifié par `banque/commun.mjs`), fonctions Netlify `netlify/functions/push-*.mjs` et `rappels-push.mjs`, réception dans `sw.js` (`push`, `notificationclick`), interface `pushHTML`/`pushActiver` dans index.html. Contrôle : `node tests/push.test.js`.
