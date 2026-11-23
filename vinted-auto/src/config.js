// Réglages par défaut. Tout est modifiable dans la page Options de l'extension.
import { PERSONNALITE_PAR_DEFAUT } from "./personnalite.js";

export const CONFIG_PAR_DEFAUT = {
  // Interrupteur général : rien ne tourne tant que c'est false.
  actif: false,
  // "brouillon" : Claude écrit la réponse, tu valides dans le popup avant envoi.
  // "auto" : la réponse part toute seule.
  mode: "brouillon",

  // "modeles" : réponses toutes faites par mots-clés. Gratuit, sans clé.
  // "local" : réponses toutes faites + IA locale (Ollama) pour le reste. Gratuit.
  // "claude" : réponses écrites par Claude. Payant (clé API).
  // Par défaut "local" : Ollama et gemma3:12b sont installés sur le PC de Willem.
  moteur: "local",
  local: {
    url: "http://localhost:11434",
    // Modèle Ollama. Gemma 3 12B : ~10 Go (carte graphique 8 Go + ~4 Go de RAM), environ 10 s
    // par réponse sur le PC de Willem, n'invente rien dans les essais. Llama 3.1 8B invente des détails,
    // Llama 3.3 70B (26 Go) prend trop de RAM.
    modele: "gemma3:12b",
    // Au-delà, la réponse est abandonnée (notification). Gros modèle sur CPU : augmente.
    delaiMaxSec: 120,
    // Durée pendant laquelle Ollama garde le modèle en mémoire après une réponse ("30m", "8h", ou le nombre -1 = toujours).
    // Sans carte graphique, le premier appel après un déchargement est long : gemma3:12b sur un
    // Core Ultra 5 125H (CPU seul) met 4 à 6,5 minutes à froid, 15 à 30 s à chaud (mesuré le 2026-11-23).
    keepAlive: "30m",
    // Bas = le modèle suit mieux les règles et invente moins.
    temperature: 0.2,
    // Mode Auto : les réponses de l'IA locale partent seules seulement si c'est coché.
    // Par défaut elles restent en brouillon : un petit modèle peut inventer un détail.
    envoiAuto: false,
  },
  modeles: {
    // Ex. "sous 2 jours". Vide : "j'envoie dès que je peux".
    delaiEnvoi: "",
  },

  // Clé API Claude (console.anthropic.com), seulement pour le moteur "claude".
  // Stockée uniquement dans ton Chrome.
  apiKey: "",
  modele: "claude-opus-5-5",
  effort: "low",

  // Compte Vinted
  domaine: "www.vinted.fr",
  pseudo: "",
  // Laisse vide : l'extension lit ton ID dans le cookie v_uid.
  // Sinon, c'est le nombre dans l'URL de ton profil : vinted.fr/member/12345678-pseudo
  userId: "",
  // Ouvre un onglet Vinted épinglé en arrière-plan si aucun n'est ouvert.
  ouvrirOngletAuto: true,

  personnalite: PERSONNALITE_PAR_DEFAUT,

  // Plage horaire où l'extension agit (heure locale). Hors plage : elle attend.
  heures: { debut: 8, fin: 23 },

  messages: {
    actif: true,
    intervalleMin: 3,
    // Délai aléatoire avant de répondre (minutes) : une réponse instantanée fait bot.
    delaiReponseMin: [2, 8],
    maxParPassage: 5,
  },

  // Commande annulée par l'acheteur : l'article est remis en ligne tout seul (bouton « Republier »
  // du message Vinted), même en mode Brouillon : ce n'est pas un message à quelqu'un.
  republierAnnulees: true,

  // EXPÉRIMENTAL : routes Vinted pas encore vérifiées sur un vrai compte.
  negociation: {
    actif: false,
    // Offre acceptée si elle atteint ce % du prix affiché. Sinon contre-offre.
    prixMinPct: 80,
  },

  // EXPÉRIMENTAL : contacter les personnes qui likent une annonce.
  // Routes relevées sur le site le 2026-11-23 (notifications et inquiries sur api.vinted.fr).
  // Aucun envoi réel essayé pour l'instant.
  offresLikes: {
    actif: false,
    // Message "j'ai vu que vous aviez liké mon annonce...".
    message: true,
    // Faire aussi une offre avec remise (route non vérifiée).
    offre: false,
    remisePct: 15,
    maxParJour: 20,
    // "il a pas mal de likes" seulement si l'annonce a au moins ce nombre de favoris.
    seuilPopulaire: 5,
    // Envoi sans validation (en mode Auto). Sinon : brouillon dans le popup.
    envoiAuto: false,
  },

  // EXPÉRIMENTAL : supprime puis recrée l'annonce (mêmes photos, même texte).
  republication: {
    actif: false,
    creneaux: ["08:00", "12:30", "19:00"],
    parCreneau: 2,
    ageMinJours: 7,
  },
};

// Réglages propres à un PC, dans extension/reglages-pc.json (hors git), appliqués quand on charge
// ou recharge l'extension. Exemple : { "local.modele": "gemma3:12b", "local.delaiMaxSec": 300, "personnalite": "defaut" }.
// Seulement ces clés. Jamais actif, mode, clé API ni envoi sans validation : ça reste un choix fait à la main.
export const CLES_REGLAGES_PC = [
  "moteur",
  "local.url",
  "local.modele",
  "local.delaiMaxSec",
  "local.keepAlive",
  "modeles.delaiEnvoi",
  "personnalite",
  "offresLikes.actif",
];

export function appliquerReglagesPc(stockee, reglages = {}) {
  const config = fusionnerConfig(stockee);
  for (const cle of CLES_REGLAGES_PC) {
    if (!(cle in reglages)) continue;
    const valeur = cle === "personnalite" && reglages[cle] === "defaut" ? CONFIG_PAR_DEFAUT.personnalite : reglages[cle];
    const [groupe, sous] = cle.split(".");
    if (sous) config[groupe] = { ...config[groupe], [sous]: valeur };
    else config[groupe] = valeur;
  }
  return config;
}

// Fusion profonde : garde les nouvelles clés par défaut quand la config stockée est ancienne.
export function fusionnerConfig(stockee) {
  const fusion = (base, extra) => {
    if (Array.isArray(base) || typeof base !== "object" || base === null) {
      return extra === undefined ? base : extra;
    }
    const out = { ...base };
    for (const [cle, valeur] of Object.entries(extra || {})) {
      out[cle] = cle in base ? fusion(base[cle], valeur) : valeur;
    }
    return out;
  };
  return fusion(CONFIG_PAR_DEFAUT, stockee || {});
}
