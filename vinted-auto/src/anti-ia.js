// Filtre anti-IA.
//
// Source : Wikipedia "Signs of AI writing" (en) et "Aide:Identifier l'usage d'une IA
// générative" (fr), adaptés à des messages Vinted en français.
// Deux usages :
//   1. REGLES_ANTI_IA est ajouté au prompt de Claude (prévention).
//   2. verifierTexte() contrôle chaque réponse avant envoi (contrôle).
//      Si une règle est violée, Claude réécrit. Toujours raté : ça part en brouillon.

export const REGLES_ANTI_IA = `STYLE INTERDIT (ça sonne IA, un vrai vendeur Vinted n'écrit jamais comme ça)

Formules de service client et de chatbot, jamais :
"n'hésite pas" / "n'hésitez pas", "je reste à ta/votre disposition", "je serais ravi", "ravi de",
"excellente question", "bonne question", "absolument", "certainement", "bien sûr" en début de message,
"je comprends tout à fait", "je comprends parfaitement", "merci pour ton/votre message",
"merci de ton/votre intérêt", "j'espère que ça t'aide", "si tu as d'autres questions",
"souhaitez-vous", "cordialement", "bien à vous", "au plaisir", "désolé pour la gêne occasionnée",
"pour toute question", "voici", "concernant ta question", "en ce qui concerne", "pour répondre à ta question".

Mots de rédaction ou de pub, jamais :
crucial, essentiel, primordial, incontournable, véritable, témoigne, souligne, met en valeur,
met en lumière, illustre, incarne, riche, vibrant, fascinant, captivant, remarquable,
exceptionnel, intemporel, élégant, sublime, raffiné, allie, alliant, parfait pour, idéal pour,
atout, plonger, explorer, favoriser, renforcer, optimiser, méticuleux, robuste, au cœur de,
niché, révolutionnaire, renommé, large éventail, se veut, s'impose comme, constitue, fait office de.

Connecteurs de dissertation, jamais :
"de plus", "en outre", "par ailleurs", "néanmoins", "toutefois", "ainsi,", "en effet,", "notamment",
"il convient de", "il est important de noter", "il est à noter", "afin de", "en résumé",
"en conclusion", "pour résumer", "en somme", "globalement".

Tournures typiques d'IA, jamais :
- "ce n'est pas juste X, c'est Y", "non seulement X mais aussi Y", "plutôt que", "pas de X, pas de Y, juste Z".
- Les listes de trois ("propre, pratique et solide"). Un seul adjectif suffit, ou zéro.
- Résumer ou conclure à la fin. Reformuler la question de l'acheteur avant d'y répondre.
- Proposer de l'aide en plus à la fin ("si besoin je peux aussi..."), sauf proposer une photo quand on ne sait pas.
- "d'après les informations disponibles", "selon l'annonce" : dis juste ce que tu sais.
- Toute phrase où tu parles de toi comme d'une IA, d'un assistant ou d'un modèle.

Ponctuation et mise en forme, jamais :
tiret long (—) ou moyen (–), guillemets « » ou “ ”, apostrophe courbe (’), points de suspension en un seul caractère (…),
gras, titres, listes à puces ou numérotées, plusieurs paragraphes, crochets à remplir, signature à la fin.
Pas plus d'un point d'exclamation. Pas plus d'un emoji, et jamais en début de message.
Pas plus d'un mot d'oral par message ("bah", "ben", "ah", "genre", "enfin", "du coup"), et le plus souvent aucun.

À la place : des phrases courtes et simples, des verbes simples ("c'est", "il y a", "j'ai", "je sais pas"),
le ton d'un message tapé vite sur un téléphone.`;

// ---------- Nettoyage typographique automatique ----------
// Ces défauts sont corrigés sans demander de réécriture à Claude.
export function nettoyerTypo(texte, { feminin = true } = {}) {
  return (texte || "")
    .replace(/[   ]/g, " ")
    .replace(/[’‘ʼ]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/«\s*/g, '"')
    .replace(/\s*»/g, '"')
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/…/g, "...")
    .replace(/\*\*|__/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/[ \t]+/g, " ")
    .replace(/ ,/g, ",")
    // « désolé » parle toujours de la personne du compte (vu avec gemma3:12b le 2026-11-23) :
    // au féminin pour Julie, au masculin pour Willem.
    .replace(feminin ? /(^|[^\p{L}])([dD]ésolé)(?!\p{L})/gu : /(^|[^\p{L}])([dD]ésolé)e(?!\p{L})/gu, feminin ? "$1$2e" : "$1$2")
    .trim();
}

// ---------- Règles de contrôle ----------
// Chaque règle : [nom lisible, regex]. Insensible à la casse et aux accents (voir sansAccents).
const R = (nom, motif) => ({ nom, re: new RegExp(motif, "i") });

const REGLES = [
  // Service client / chatbot
  R("n'hésite pas", String.raw`\bn'?h[e]site[sz]? (pas|surtout)`),
  R("à disposition", String.raw`\b(a|reste a) (ta|votre|ton) disposition`),
  R("je serais ravi", String.raw`\b(je serai[st]? ravie?|ravie? de)\b`),
  R("bonne/excellente question", String.raw`\b(bonne|excellente|tres bonne) question\b`),
  R("absolument / certainement", String.raw`\b(absolument|certainement)\b`),
  R("bien sûr en début", String.raw`^\s*(bien sur|tout a fait)\b`),
  R("je comprends tout à fait", String.raw`\bje comprends (tout a fait|parfaitement|bien ta|bien votre|ta |votre )`),
  R("merci pour le message", String.raw`\bmerci (pour|de) (ton|votre) (message|interet|question|retour)`),
  R("j'espère que ça aide", String.raw`\bj'?espere que (ca|cela|ce message)`),
  R("d'autres questions", String.raw`\b(d'?autres|toute) questions?\b`),
  R("souhaitez-vous", String.raw`\bsouhaite[sz]?[- ](vous|tu)\b`),
  R("formule de politesse", String.raw`\b(cordialement|bien a vous|au plaisir|belle journee a vous|je vous remercie)\b`),
  R("excuses service client", String.raw`\b(desole|navre)e? pour (la gene|le desagrement|tout desagrement)`),
  R("voici / concernant", String.raw`\b(voici|concernant (ta|votre)|en ce qui concerne|pour repondre a)\b`),

  // IA explicite
  R("se présente comme IA", String.raw`\b(en tant qu'?(ia|assistant|intelligence)|intelligence artificielle|modele de langage|assistant virtuel|chatbot|mes connaissances|ma derniere mise a jour)\b`),

  // Vocabulaire IA / pub
  R("vocabulaire IA", String.raw`\b(crucial|cruciale|essentiel|essentielle|primordial|incontournable|veritable|temoigne|souligne|met en (valeur|lumiere|avant)|incarne|vibrant|vibrante|fascinant|fascinante|captivant|captivante|remarquable|exceptionnel|exceptionnelle|intemporel|intemporelle|elegant|elegante|elegance|sublime|raffine|raffinee|allie|alliant|parfait pour|parfaite pour|ideal pour|ideale pour|atout|plonge[rz]?|explore[rz]?|favorise[rz]?|renforce[rz]?|optimise[rz]?|meticuleu[xs]e?|robuste|au coeur de|niche dans|revolutionnaire|renomme|renommee|large eventail|se veut|s'impose comme|constitue|fait office de|c'?est garanti|je (te|vous) (le |la |les )?garantis)\b`),

  // Connecteurs de dissertation
  R("connecteur de dissertation", String.raw`\b(de plus|en outre|par ailleurs|neanmoins|toutefois|notamment|il convient|il est important|il est a noter|afin de|en resume|en conclusion|pour resumer|en somme|globalement|force est de constater)\b`),
  R("ainsi / en effet en tête de phrase", String.raw`(^|[.!?]\s+)(ainsi|en effet),`),

  // Tournures
  R("ce n'est pas X, c'est Y", String.raw`\b(ce n'?est pas|c'?est pas) (seulement|juste|qu'?un|que) [^.!?]{1,60}, c'?est\b`),
  R("non seulement… mais", String.raw`\bnon seulement\b[^.!?]*\bmais\b`),
  R("plutôt que", String.raw`\bplutot que\b`),
  R("liste de trois", String.raw`\b[a-z]{4,}, [a-z]{4,},? et [a-z]{4,}\b`),
  R("selon les infos", String.raw`\b(d'?apres|selon) (les|mes) (informations|infos|donnees)\b`),
  R("selon l'annonce", String.raw`\bselon l'?annonce\b`),

  // Mise en forme
  R("liste à puces", String.raw`(^|\n)\s*([-•*]|\d+[.)])\s`),
  R("crochets à remplir", String.raw`\[[^\]]*\]`),

  // Règles du compte : tout passe par Vinted, jamais de garantie d'authenticité.
  R("coordonnées hors Vinted", String.raw`(https?://|www\.|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}|(\+33|\b0)\s?[1-9]([ .-]?\d{2}){4}\b)`),
  R("garantie d'authenticité", String.raw`(?<!sans |pas de |aucune )\bgaranti(e|es|s)?\b|\bcertifiee?s?\b|\bauthentifiee?s?\b`),
];

// "c'est des vraies ?" : jamais "oui" sans dire qu'elle n'y connaît rien.
const PARLE_AUTHENTICITE = /\b(vraies?|vrais|authentiques?|originale?s?|originaux|officielles?)\b/;
const AVEC_RESERVE = /(pour moi|j'?imagine|je pense|je crois|a priori|connais (rien|pas)|y connais|aucune idee|sais pas|peux pas (te |vous )?(le |la |les )?garantir)/;

const EMOJI = /\p{Extended_Pictographic}/gu;

// Comparaison sans accents ni majuscules : "Hésitez" et "hesitez" matchent pareil.
export function sansAccents(texte) {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Contrôle une réponse. Renvoie le texte nettoyé et la liste des problèmes.
 * @returns {{texte: string, ok: boolean, problemes: {regle: string, extrait: string}[]}}
 */
export function verifierTexte(brut, { longueurMax = 280, phrasesMax = 3, forme = null, feminin = true } = {}) {
  const texte = nettoyerTypo(brut, { feminin });
  const plat = sansAccents(texte);
  const problemes = [];

  for (const { nom, re } of REGLES) {
    const m = plat.match(re);
    if (m) problemes.push({ regle: nom, extrait: m[0].trim() });
  }
  // forme : "tu" ou "vous" selon l'acheteur (modeles.js formeAcheteur).
  const tutoie = plat.match(/\b(tu|te|ton|ta|tes|toi)\b|\bt'/);
  if (forme === "vous" && tutoie) problemes.push({ regle: "tutoie un acheteur qui vouvoie", extrait: tutoie[0] });
  const vouvoie = plat.match(/\b(vous|votre|vos)\b/);
  if (forme === "tu" && vouvoie) problemes.push({ regle: "vouvoie un acheteur qui tutoie", extrait: vouvoie[0] });

  const authenticite = plat.match(PARLE_AUTHENTICITE);
  if (authenticite && !AVEC_RESERVE.test(plat)) {
    problemes.push({ regle: "authenticité affirmée sans réserve", extrait: authenticite[0] });
  }

  if (texte.length > longueurMax) {
    problemes.push({ regle: "trop long", extrait: `${texte.length} caractères (max ${longueurMax})` });
  }
  const phrases = texte.split(/[.!?]+(?:\s|$)/).filter((p) => p.trim().length > 1);
  if (phrases.length > phrasesMax) {
    problemes.push({ regle: "trop de phrases", extrait: `${phrases.length} phrases (max ${phrasesMax})` });
  }
  if ((texte.match(/\n/g) || []).length > 1) {
    problemes.push({ regle: "plusieurs paragraphes", extrait: "retours à la ligne" });
  }
  if ((texte.match(/!/g) || []).length > 1) {
    problemes.push({ regle: "trop de points d'exclamation", extrait: "!" });
  }
  const tics = plat.match(/(^|[^a-z])(bah|ben|ah|genre|enfin|du coup)(?![a-z])/g) || [];
  if (tics.length > 1) {
    problemes.push({ regle: "trop de mots d'oral", extrait: tics.map((t) => t.trim()).join(", ") });
  }
  const emojis = texte.match(EMOJI) || [];
  if (emojis.length > 1) {
    problemes.push({ regle: "trop d'emojis", extrait: emojis.join("") });
  }
  if (/^\s*\p{Extended_Pictographic}/u.test(texte)) {
    problemes.push({ regle: "emoji en début de message", extrait: emojis[0] || "" });
  }

  return { texte, ok: problemes.length === 0, problemes };
}

export function decrireProblemes(problemes) {
  return problemes.map((p) => `${p.regle} ("${p.extrait}")`).join(" ; ");
}
