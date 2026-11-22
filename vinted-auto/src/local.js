// Moteur gratuit "IA locale" : un modèle open source qui tourne sur ton PC avec Ollama (ollama.com).
// Aucun compte, aucune clé, rien ne sort de ton PC.
import { construireSysteme, construireContenu, avecFiltreAntiIA } from "./prompt.js";

// Format JSON imposé au modèle (Ollama "structured outputs").
const SCHEMA = {
  type: "object",
  properties: {
    reponse: { type: "string" },
    besoin_humain: { type: "boolean" },
    raison: { type: "string" },
    memo: { type: "string" },
  },
  required: ["reponse", "besoin_humain", "raison", "memo"],
};

export class ErreurLocale extends Error {}

async function appeler(config, systeme, contenu) {
  const url = `${config.local.url.replace(/\/$/, "")}/api/chat`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.local.modele,
        stream: false,
        format: SCHEMA,
        options: { temperature: 0.6 },
        messages: [
          { role: "system", content: systeme },
          { role: "user", content: contenu },
        ],
      }),
    });
  } catch {
    throw new ErreurLocale("IA locale injoignable : Ollama n'est pas lancé sur ce PC");
  }
  if (res.status === 403) {
    throw new ErreurLocale("Ollama refuse l'extension : règle OLLAMA_ORIGINS (voir README)");
  }
  if (res.status === 404) {
    throw new ErreurLocale(`Modèle "${config.local.modele}" pas installé : lance "ollama pull ${config.local.modele}"`);
  }
  if (!res.ok) throw new ErreurLocale(`IA locale : HTTP ${res.status}`);

  const data = await res.json();
  let sortie;
  try {
    sortie = JSON.parse(data?.message?.content ?? "");
  } catch {
    return { reponse: "", besoin_humain: true, raison: "l'IA locale a renvoyé une réponse illisible", memo: "" };
  }
  return {
    reponse: typeof sortie.reponse === "string" ? sortie.reponse.trim() : "",
    besoin_humain: Boolean(sortie.besoin_humain),
    raison: typeof sortie.raison === "string" ? sortie.raison : "",
    memo: typeof sortie.memo === "string" ? sortie.memo.trim() : "",
  };
}

/**
 * Même contrat que genererReponse (claude.js), avec le modèle local.
 */
export async function genererReponseLocale(config, { annonce, messages, fiche }) {
  const systeme = construireSysteme(config.personnalite);
  const base = construireContenu({ annonce, messages, fiche });
  return avecFiltreAntiIA((contenu) => appeler(config, systeme, contenu), base);
}
