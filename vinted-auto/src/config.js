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
  moteur: "modeles",
  local: {
    url: "http://localhost:11434",
    // Modèle Ollama. "mistral-nemo" (12B) écrit bien le français. Plus léger : "mistral".
    modele: "mistral-nemo",
    // Au-delà, la réponse est abandonnée (notification). Gros modèle sur CPU : augmente.
    delaiMaxSec: 300,
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

  // EXPÉRIMENTAL : routes Vinted pas encore vérifiées sur un vrai compte.
  negociation: {
    actif: false,
    // Offre acceptée si elle atteint ce % du prix affiché. Sinon contre-offre.
    prixMinPct: 80,
  },

  // EXPÉRIMENTAL
  offresLikes: {
    actif: false,
    remisePct: 15,
    maxParJour: 20,
  },

  // EXPÉRIMENTAL : supprime puis recrée l'annonce (mêmes photos, même texte).
  republication: {
    actif: false,
    creneaux: ["08:00", "12:30", "19:00"],
    parCreneau: 2,
    ageMinJours: 7,
  },
};

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
