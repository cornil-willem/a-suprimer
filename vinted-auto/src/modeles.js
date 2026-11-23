// Mode gratuit : réponses modèles déclenchées par mots-clés. Aucune IA, aucun coût.
// Les phrases reprennent la personnalité. Message non reconnu : notification, tu réponds toi-même.
import { sansAccents } from "./anti-ia.js";

// Règles qui laissent toujours la main à l'humain (aucune réponse automatique, ou réponse + notification).
// Ordre = priorité. Les motifs s'appliquent au message sans accents et en minuscules.
const REGLES_HUMAIN = [
  {
    id: "bot",
    raison: "l'acheteur demande si c'est un bot",
    motif: /\b(bot|robot|ia|intelligence artificielle|chat ?gpt|automatiques?|une machine|humaine?s?)\b|vraie personne|personne reelle|reponses? auto\b|qui (m'?)?(ecri|me repond|repond|parle)|(parle|ecris|ecrit) a qui\b/,
  },
  {
    id: "probleme",
    raison: "litige, retour, remboursement ou colis",
    motif: /(rembours|litige|retour|pas recu|jamais recu|perdu|abime|casse|arnaque|escro|plainte|signale|colis (est )?(bloque|vide|ouvert|endommage))/,
  },
  {
    id: "fausses",
    raison: "carte signalée fausse",
    motif: /(c'?est (des )?(faux|fausses?|fakes?)|sont (des )?fausses|contrefa|pas des vraies|pas authentique|\bdes fakes?\b)/,
    reponses: [
      "je m'y connais pas vraiment donc je peux pas te garantir",
      "honnêtement j'y connais rien donc je peux pas te garantir",
    ],
  },
  {
    id: "mainPropre",
    raison: "remise en main propre demandée",
    motif: /(main propre|mains propres|remise en main|se voir|sur place|se rencontrer)/,
  },
];

const REGLES = [
  {
    id: "contact",
    motif: /(whatsapp|numero|telephone|\bmail\b|paypal|virement|lydia|snap|insta|hors vinted|en dehors de vinted)/,
    reponses: ["je passe que par Vinted", "désolée je passe que par Vinted"],
  },
  {
    id: "dispo",
    motif: /(dispo|toujours (en vente|la|a vendre)|encore (en vente|la|a vendre))/,
    reponses: ["oui c'est toujours dispo", "oui toujours dispo"],
  },
  {
    id: "vraies",
    motif: /\b(vraies?|vrais|authentiques?|originale?s?|originaux|officielles?)\b|pas des fausses/,
    reponses: [
      "pour moi oui, c'est mon grand frère qui les collectionnait donc j'imagine. après j'y connais rien, je les récupère juste chez lui",
      "pour moi oui, elles viennent de mon grand frère qui collectionnait avant. après je m'y connais pas du tout",
    ],
  },
  {
    // État, holo, édition, année, valeur : elle n'y connaît rien, rien n'est inventé.
    id: "details",
    exclusPar: "photos",
    motif: /\b(annee|date de quand|de quelle epoque|editions?|1ere ed|premiere ed|holos?|holographiques?|reverse|rares?|rarete|etat|abimee?s?|(la|sa|leur|une) cote|valent|valeur|psa|gradee?s?|langue|en (francais|anglais|japonais)|japonaises?|serie|extension)\b/,
    reponses: [
      "aucune idée, j'y connais rien. regarde les photos de l'annonce",
      "je sais pas trop, j'y connais rien. tout est sur les photos de l'annonce",
    ],
  },
  {
    id: "echange",
    motif: /\bechang/,
    reponses: ["non je fais pas d'échange", "non désolée, je fais pas d'échange"],
  },
  {
    id: "autres",
    motif: /(d'?autres (cartes|lots?|comme)|en (as|avez) d'autres|(t'|tu )en as (encore|plus)|vous en avez (encore|plus)|autre chose a vendre)/,
    reponses: ["pour l'instant tout ce que j'ai est dans mon dressing", "tout ce que j'ai est dans mon dressing pour l'instant"],
  },
  {
    id: "photos",
    raison: "photos demandées",
    humain: true,
    motif: /(photos?|images?|\bpics?\b|voir (le|les) (dos|verso|recto))/,
    reponses: ["oui je t'envoie ça dans la journée ou demain", "oui je t'en envoie demain au plus tard"],
  },
  {
    id: "provenance",
    motif: /(ou (est-ce que |est ce que )?(tu|vous) (les )?(as|avez) (eu|trouve|recupere|achete)|ou (tu|vous) les (as|avez)|d'?ou (elles |ils )?vien|(eu|trouve|recupere|achete)e?s? ou\b|provenance)/,
    reponses: [
      "c'est mon grand frère, il collectionnait avant et des fois il me donne ses doubles",
      "je les récupère chez mon grand frère, il collectionnait avant",
    ],
  },
  {
    id: "prixBas",
    motif: /(pourquoi|comment).{0,30}(pas cher|si peu|si bas|ce prix|petits? prix)|(pas cher|si peu cher|prix (si )?bas).{0,20}pourquoi/,
    reponses: [
      "je m'y connais pas trop et je les récupère chez mon frère, donc ça me dérange pas de les mettre pas cher",
      "honnêtement je sais pas ce que ça vaut, pour moi c'est les cartes qu'on avait petits",
      "j'ai besoin d'un peu d'argent pour mes études, du coup je les mets pas cher",
    ],
  },
  {
    id: "besoinArgent",
    motif: /pourquoi.{0,30}besoin|besoin d'?argent/,
    reponses: ["je suis étudiante, j'ai un appart à payer"],
  },
  {
    id: "reserver",
    motif: /(reserv|mettre de cote|me (le|la|les) garder|garder pour moi)/,
    reponses: ["je peux pas réserver, c'est le premier qui achète", "désolée je peux pas réserver, c'est le premier qui achète"],
  },
  {
    id: "negocier",
    motif: /(dernier prix|baiss|reduc|negoci|moins cher|faire un prix|un geste|a combien)/,
    reponses: ["fais une offre, je regarde", "tu peux faire une offre, je regarde"],
  },
  {
    id: "lot",
    motif: /(faire un lot|en lot|plusieurs articles|les deux|ensemble|lot avec)/,
    reponses: ["ajoute-les dans un lot et fais une offre", "fais un lot avec ce qui t'intéresse et une offre, je regarde"],
  },
  {
    id: "envoi",
    // Envoi du colis (pas "envoyer des photos").
    motif: /(expedi|tu postes|vous postez|delai d'?envoi|quand.{0,25}(envoi|envoie|envoyer|recevoir|partir|poster)|(envoie|envoies|envoyez|envoyer|envoi)[^?]{0,15}(quand|rapide|vite))/,
    reponses: (config) =>
      config.modeles?.delaiEnvoi
        ? [`j'envoie en général ${config.modeles.delaiEnvoi}`]
        : ["j'envoie dès que je peux"],
  },
];

// Questions de l'acheteur sur l'envoi de SA commande.
const ENVOI_ACHETEUR = /(envoy|expedi|c'?est parti|t'?as poste|avez poste|deja poste|le colis|suivi|quand.{0,25}(recevoir|arrive|partir|poster|envoi))/;

function reponseEnvoiAcheteur(envoi, config) {
  if (envoi === "envoye") {
    return ["oui c'est parti, tu peux suivre le colis dans ta commande", "oui il est envoyé, le suivi est dans ta commande"];
  }
  if (envoi === "livre") return ["il est marqué livré de mon côté"];
  return config.modeles?.delaiEnvoi
    ? [`pas encore, je l'envoie ${config.modeles.delaiEnvoi}`]
    : ["pas encore, je l'envoie dès que je peux", "pas encore mais je l'envoie dès que je peux"];
}

// Article plus disponible (vendu à quelqu'un d'autre ou supprimé) : un seul message, puis plus rien.
const PLUS_DISPO = ["désolée, il est plus dispo", "désolée, l'article est plus disponible", "ah désolée il est plus dispo"];

export function reponsePlusDispo(conv) {
  const messages = conv.messages || [];
  const dejaDit = messages.some((m) => m.de === "moi" && /plus dispo|vendu|deja parti/.test(sansAccents(m.texte)));
  if (dejaDit) {
    return { reponse: "", besoin_humain: false, rien: true, raison: "article plus dispo, déjà dit", problemes: [], essais: 0, regles: ["indisponible"] };
  }
  return { reponse: choisir(PLUS_DISPO, []), besoin_humain: false, raison: "", problemes: [], essais: 0, regles: ["indisponible"] };
}

// Premier message à quelqu'un qui a liké une annonce. Vouvoiement (premier contact).
// "Pas mal de likes" seulement si c'est vrai (nombre de favoris au-dessus du seuil).
const MESSAGES_LIKE = [
  "Bonjour, j'ai vu que vous aviez liké mon annonce, elle est toujours dispo et prête à partir si ça vous intéresse",
  "Bonjour, vous avez mis mon annonce en favori, si ça vous intéresse tout est prêt à être envoyé",
  "Bonjour, j'ai vu votre like sur mon annonce, l'article est prêt à partir si jamais ça vous tente",
  "Bonjour, merci pour le like, l'article est toujours dispo et prêt à être envoyé si vous le voulez",
];
const AJOUT_POPULAIRE = ["il a pas mal de likes", "il y a pas mal de monde dessus"];

export function messageLike({ favoris = 0, seuilPopulaire = 5 } = {}) {
  const base = choisir(MESSAGES_LIKE, []);
  if (favoris >= seuilPopulaire && seuilPopulaire > 0) return `${base}, ${choisir(AJOUT_POPULAIRE, [])}`;
  return base;
}

// Accusé de réception sans question : pas besoin de répondre.
const RIEN = /^\s*(merci|ok|d'accord|dac|super|top|parfait|cool|ca marche|tres bien)\b[^?]{0,25}$/;
// Message seul qui ne demande rien : salutation, emoji, ponctuation.
const NEUTRE = /^\s*((bonjour|bonsoir|salut|coucou|hello|bjr|slt|re)\b[\s!.,]*(madame|mademoiselle)?[\s!.,]*|[^a-z0-9]*)$/;

const VOUVOIEMENT = [
  [/\bje t'envoie\b/g, "je vous envoie"],
  [/\bje t'en envoie\b/g, "je vous en envoie"],
  [/\bte garantir\b/g, "vous garantir"],
  [/\bfais une offre\b/g, "faites une offre"],
  [/\bfais un lot\b/g, "faites un lot"],
  [/\bajoute-les\b/g, "ajoutez-les"],
  [/\btu peux\b/g, "vous pouvez"],
  [/\bregarde les\b/g, "regardez les"],
  [/\bce qui t'intéresse\b/g, "ce qui vous intéresse"],
  [/\bta commande\b/g, "votre commande"],
];

export function vouvoyer(texte) {
  return VOUVOIEMENT.reduce((t, [re, remplacement]) => t.replace(re, remplacement), texte);
}

function acheteurVouvoie(messages) {
  return formeAcheteur(messages) === "vous";
}

// "tu", "vous" ou null (on ne sait pas). Le tutoiement l'emporte si l'acheteur mélange.
export function formeAcheteur(messages) {
  const texte = sansAccents(messages.filter((m) => m.de === "acheteur").map((m) => m.texte).join(" "));
  if (/\b(tu|ton|ta|tes|toi)\b|\bt'/.test(texte)) return "tu";
  if (/\b(vous|votre|vos)\b/.test(texte)) return "vous";
  return null;
}

function salutation(question, vous) {
  const q = sansAccents(question).trim();
  if (/^(salut|coucou|hello|hey|slt|cc)\b/.test(q)) return "salut, ";
  if (/^(bonjour|bonsoir)\b/.test(q) || vous) return "Bonjour, ";
  return "";
}

// Choisit une variante pas encore envoyée dans cette conversation.
// dejaEnvoye : morceaux de phrases déjà envoyés, sans accents ni salutation.
function choisir(variantes, dejaEnvoye) {
  const neuves = variantes.filter((v) => !dejaEnvoye.includes(sansAccents(v)) && !dejaEnvoye.includes(sansAccents(vouvoyer(v))));
  const liste = neuves.length ? neuves : variantes;
  return liste[Math.floor(Math.random() * liste.length)];
}

/**
 * @param {{messages: {de: string, texte: string}[]}} conv  Conversation normalisée.
 * @returns {{reponse: string, besoin_humain: boolean, raison: string, rien?: boolean, regles: string[], problemes: [], essais: number}}
 */
export function repondreAvecModeles(conv, config = {}) {
  const messages = conv.messages || [];
  // Tous les messages de l'acheteur depuis la dernière réponse du compte.
  const depuis = messages.length - 1 - [...messages].reverse().findIndex((m) => m.de === "moi");
  const nouveaux = messages.slice(depuis >= messages.length ? 0 : depuis + 1).filter((m) => m.de === "acheteur");
  const question = nouveaux.map((m) => m.texte).join(" ");
  const q = sansAccents(question);
  const vous = acheteurVouvoie(messages);
  const premierMessage = !messages.some((m) => m.de === "moi");
  const dejaEnvoye = messages
    .filter((m) => m.de === "moi")
    .flatMap((m) => sansAccents(m.texte).replace(/^(bonjour|salut), /, "").split(". "));
  const fin = (r) => ({ problemes: [], essais: 0, ...r });

  // L'acheteur de l'article demande où en est l'envoi : réponse d'après le statut Vinted.
  if (conv.article?.achete && ENVOI_ACHETEUR.test(q) && !REGLES_HUMAIN.some((r) => r.motif.test(q))) {
    const texte = choisir(reponseEnvoiAcheteur(conv.article.envoi, config), dejaEnvoye);
    return fin({ reponse: vous ? vouvoyer(texte) : texte, besoin_humain: false, raison: "", regles: ["envoiAcheteur"] });
  }

  const humain = REGLES_HUMAIN.find((r) => r.motif.test(q));
  if (humain) {
    const texte = humain.reponses ? choisir(humain.reponses, dejaEnvoye) : "";
    return fin({
      reponse: texte && vous ? vouvoyer(texte) : texte,
      besoin_humain: true,
      raison: humain.raison,
      regles: [humain.id],
    });
  }

  const toutes = REGLES.filter((r) => r.motif.test(q));
  const trouvees = toutes.filter((r) => !toutes.some((a) => a.id === r.exclusPar)).slice(0, 2);
  // Un des messages n'est pas compris : pas de réponse partielle, on traite comme une question inconnue.
  const incompris = nouveaux.some((m) => {
    const t = sansAccents(m.texte);
    return !RIEN.test(t) && !NEUTRE.test(t) && !REGLES.some((r) => r.motif.test(t));
  });
  if (!trouvees.length || incompris) {
    if (RIEN.test(q)) return fin({ reponse: "", besoin_humain: false, rien: true, raison: "pas besoin de répondre", regles: [] });
    return fin({ reponse: "", besoin_humain: true, inconnue: true, raison: "question pas reconnue, à toi de répondre", regles: [] });
  }

  const morceaux = trouvees.map((r) => {
    const variantes = typeof r.reponses === "function" ? r.reponses(config) : r.reponses;
    const texte = choisir(variantes, dejaEnvoye);
    return vous ? vouvoyer(texte) : texte;
  });
  const bonjour = premierMessage ? salutation(nouveaux[0]?.texte || "", vous) : "";
  const avecHumain = trouvees.find((r) => r.humain);
  return fin({
    reponse: bonjour + morceaux.join(". "),
    besoin_humain: Boolean(avecHumain),
    raison: avecHumain?.raison || "",
    memo: avecHumain?.raison || "",
    regles: trouvees.map((r) => r.id),
  });
}
