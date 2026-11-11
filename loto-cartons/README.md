# Loto Cartons — v1

Appli mobile (PWA) pour jouer au loto avec beaucoup de cartons sans rien rater.

1. **Cartons** : prends tes cartons en photo (1 ou 100, une planche entière passe aussi).
   Claude lit les numéros, puis tu vérifies chaque carton avant de le valider.
   Tu peux aussi saisir un carton à la main.
2. **Partie** : choisis ce qu'on joue (quine, double quine, carton plein), puis tape chaque
   numéro annoncé sur le pavé. L'appli marque tes cartons et te prévient
   (écran, son, vibration) dès qu'un carton gagne. Elle montre aussi les cartons
   « à un numéro » et le numéro qu'ils attendent.

## Règles prises en compte

| Mode | Gagne quand |
|---|---|
| Quine | une ligne complète sur un carton |
| Double quine | deux lignes complètes sur le même carton |
| Carton plein | les trois lignes complètes |

Carton français classique : 3 lignes × 9 colonnes, 5 numéros par ligne, de 1 à 90.
La colonne d'un numéro sert à repérer les erreurs de lecture (ex. 23 et 27 sur la même ligne).

## Installer l'appli sur le téléphone

Adresse : **https://loto-cartons.vercel.app**

- **Android (Chrome)** : ouvre l'adresse, menu ⋮ → « Installer l'application »
  (ou « Ajouter à l'écran d'accueil »).
- **iPhone (Safari)** : ouvre l'adresse, bouton Partager → « Sur l'écran d'accueil ».

Lecture des photos dans l'appli installée :
- sans clé : scanne les cartons dans la page Loto Cartons sur claude.ai,
  touche « Envoyer vers l'appli du téléphone », puis dans l'appli « Coller mes cartons »
  (sur Android, le lien ouvre directement l'appli) ;
- avec une clé API Anthropic (Réglages) : lecture directe dans l'appli.

## Utiliser l'appli

L'appli tient dans `index.html` (aucune compilation). Deux façons de l'ouvrir :

- **Dans claude.ai** (artefact) : la lecture des photos passe par ton compte claude.ai,
  aucune clé à fournir. Les cartons sont sauvegardés en ligne pour ton compte.
- **Hébergée en HTTPS** (GitHub Pages, Netlify, Vercel… : n'importe quel hébergement de fichiers statiques) :
  ouvre l'adresse sur le téléphone puis « Ajouter à l'écran d'accueil ».
  Pour lire les photos, colle une clé API Anthropic dans **Réglages**.
  La clé reste sur le téléphone ; les cartons aussi (stockage du navigateur).
  La partie fonctionne sans réseau une fois l'appli chargée.

Test en local : `python3 -m http.server 8000` dans ce dossier, puis http://localhost:8000.

## Détails techniques

- Lecture des photos : Claude Opus 5.5 (`claude-opus-5-5`) via le SDK officiel
  `@anthropic-ai/sdk@1.3.0` chargé depuis jsDelivr, sortie JSON structurée,
  repli serveur activé en cas de refus (`fallbacks: "default"`).
  Dans claude.ai, la page passe par la capacité `sample` (images) de l'artefact.
- Les photos sont réduites à 2048 px avant l'envoi et ne sont pas conservées.
- Sauvegarde : `localStorage` ; dans claude.ai, aussi un document privé par personne.
- Réglages → Sauvegarde : copier/coller tous les cartons en JSON.
- `sw.js` met l'appli en cache pour jouer hors ligne.

## Idées pour la v2

- Lecture hors ligne (OCR sur le téléphone) en secours.
- Groupes de cartons (par joueur, par couleur).
- Annonce vocale du numéro tapé.
- Mode « je suis l'animateur » avec boulier virtuel.
