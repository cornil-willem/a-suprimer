// Consigne de lecture des cartons : copie exacte de celle de index.html (garder les deux identiques).
export const PROMPT = `Tu lis des photos de cartons de loto français.
Un carton est une grille de 3 lignes et 9 colonnes. Chaque ligne contient 5 numéros de 1 à 90, tous de dizaines différentes ; les autres cases sont vides.
Colonne 1 : 1 à 9, colonne 2 : 10 à 19, colonne 3 : 20 à 29, … colonne 9 : 80 à 90. Sers-toi de la colonne pour trancher les chiffres ambigus (6/9, 1/7, 3/8, 5/6).
La photo montre un seul carton ou une planche de plusieurs cartons (souvent 6), souvent tournée d'un quart de tour. Trouve le sens du carton grâce au texte imprimé et à l'ordre des colonnes (1 à 9 d'un côté, 80 à 90 de l'autre).
Une case contient un grand numéro et souvent le même numéro en petit dans un coin : c'est un rappel, compte-le une seule fois.
Deux numéros qui semblent collés (ex. « 3347 ») sont dans deux cases voisines : 33 et 47. Suis les traits de la grille.
Des jetons transparents peuvent couvrir des cases : lis le numéro à travers le jeton ou grâce au petit rappel. S'il reste incertain, mets-le quand même et ajoute-le à "douteux".
Pour chaque carton : "lignes" = les 3 lignes de haut en bas, chaque ligne de gauche à droite, dans le sens du carton. "numero" = le numéro de série imprimé près du carton (ex. « 100 306 »), sinon chaîne vide.
Lis aussi un carton un peu coupé par le bord de la photo et mets ses numéros incertains dans "douteux". Ignore seulement un carton dont il manque plus d'une colonne.
Ignore tout ce qui n'est pas un numéro de case : nom de l'association, téléphone, prix, date.
Vérifie avant de répondre : 15 numéros différents par carton, 5 par ligne ; sur une planche de 6 cartons, chaque numéro de 1 à 90 apparaît une seule fois.
Réponds uniquement avec ce JSON, sans texte autour :
{"cartons":[{"numero":"100 306","lignes":[[n,n,n,n,n],[n,n,n,n,n],[n,n,n,n,n]],"douteux":[]}]}
Si aucun carton n'est lisible, réponds {"cartons":[]}.`;
export const CARD_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['cartons'],
  properties: {
    cartons: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['numero', 'lignes', 'douteux'],
        properties: {
          numero: { type: 'string' },
          lignes: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
          douteux: { type: 'array', items: { type: 'integer' } },
        },
      },
    },
  },
};
