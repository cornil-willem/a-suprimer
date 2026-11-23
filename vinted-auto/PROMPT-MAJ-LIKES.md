# Mise à jour à donner au Claude du PC

Copie ce qui est sous la ligne dans la session Claude du PC (celle qui a déjà installé l'extension).

---

La session Claude du cloud a poussé une mise à jour sur la branche `ccr-7896bd22-oy0yoy` (version 0.1.4). Récupère-la et vérifie-la sur le vrai compte de Julie. Les règles du premier prompt restent valables : mode Brouillon, aucun message envoyé à un vrai acheteur sans mon accord.

## Ce qui a changé

1. **Article vendu à quelqu'un d'autre ou supprimé** : la réponse est un seul « désolée, il est plus dispo », puis plus rien dans cette conversation. Avant, c'était aucune réponse et une notification. Code : `reponsePlusDispo` dans `src/modeles.js`, appelée par `src/moteur.js`.
2. **La personne qui a acheté** : on continue à lui répondre. « C'est envoyé ? » reçoit une réponse d'après les messages Vinted de la conversation (« Commande envoyée », « Livrée »). Code : `etatEnvoi` et `article.achete` dans `src/vinted.js`, `ENVOI_ACHETEUR` dans `src/modeles.js`.
3. **Personnes qui likent** : message naturel une seule fois par personne et par annonce, en brouillon par défaut. Code : `messageLike` dans `src/modeles.js`, `passeOffresLikes` dans `src/background.js`, `listerLikes` dans `src/vinted.js`.

## À faire, dans l'ordre

1. Lance `git pull`, puis `npm install`, `npm test` (43 tests doivent passer) et `npm run build`. Recharge l'extension dans `chrome://extensions` et vérifie que la version affichée est 0.1.4.
2. **Vérifier l'acheteur.** Ouvre une conversation où l'article a vraiment été acheté (par exemple celle avec alexislefevre160) et regarde l'objet `transaction` renvoyé par `/api/v2/conversations/{id}`. `article.achete` se base sur `transaction.purchase_id`, qui n'a jamais été vérifié. Si le champ s'appelle autrement, corrige `normaliserConversation`. Relève aussi le texte exact des messages Vinted d'envoi et de livraison, et ajuste `etatEnvoi` si besoin. Ajoute un test dans `test/vinted.test.mjs` avec la forme réelle, en inventant les contenus.
3. **Trouver la route des likes.** `/api/v2/notifications` répond 404. Sur vinted.fr, ouvre les outils développeur (F12, onglet Réseau), puis ouvre la cloche des notifications et repère la requête qui renvoie « X a ajouté ton article à ses favoris ». Adapte `listerLikes()` pour qu'elle renvoie `[{ id, itemId, userId, login }]`.
4. **Trouver comment écrire à une personne qui a liké.** Toujours avec l'onglet Réseau, regarde ce que fait le site quand on clique sur une notification de like puis sur « Envoyer un message » ou « Faire une offre ». Adapte `ouvrirConversationVendeur()`, qui fait aujourd'hui `POST /api/v2/conversations` avec `initiator: "seller_enters_notification"` sans que ce soit vérifié. N'envoie rien à une vraie personne : relève seulement la requête que le site ferait, ou demande-moi.
5. Ajoute la nouvelle route au Diagnostic (`diagnostic()` dans `src/background.js`).
6. Fais un essai complet en mode Brouillon : active « Contacter les personnes qui likent » dans Options, attends un like ou demande-moi d'en faire un depuis un autre compte, puis vérifie que le brouillon apparaît dans le popup. Je le valide moi-même.
7. Lance `npm test` et `npm run build`, puis fais un commit clair et pousse sur `ccr-7896bd22-oy0yoy`.

## À la fin, dis-moi

- le champ réel qui indique l'acheteur, et les textes d'envoi et de livraison relevés ;
- la route des likes et la route pour écrire à une personne qui a liké ;
- ce que tu as corrigé, et ce qui reste à faire.
