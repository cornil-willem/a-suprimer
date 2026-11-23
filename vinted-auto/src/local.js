// Moteur gratuit "IA locale" : un modèle open source qui tourne sur ton PC avec Ollama (ollama.com).
// Aucun compte, aucune clé, rien ne sort de ton PC.
import { construireSysteme, construireContenu, avecFiltreAntiIA } from "./prompt.js";
import { formeAcheteur } from "./modeles.js";

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
  const delaiMaxSec = config.local.delaiMaxSec || 300;
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), delaiMaxSec * 1000);
  // Un gros modèle peut mettre plusieurs minutes : on garde le service worker Chrome éveillé.
  const battement =
    typeof chrome !== "undefined" && chrome.runtime?.getPlatformInfo
      ? setInterval(() => chrome.runtime.getPlatformInfo(), 20000)
      : null;

  let res;
  let data;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controle.signal,
      body: JSON.stringify({
        model: config.local.modele,
        stream: false,
        format: SCHEMA,
        keep_alive: config.local.keepAlive || "30m",
        options: { temperature: config.local.temperature ?? 0.2 },
        messages: [
          { role: "system", content: systeme },
          { role: "user", content: contenu },
        ],
      }),
    });
    if (res.ok) data = await res.json();
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new ErreurLocale(`IA locale trop lente (plus de ${delaiMaxSec} s) : prends un modèle plus petit`);
    }
    throw new ErreurLocale("IA locale injoignable : Ollama n'est pas lancé sur ce PC");
  } finally {
    clearTimeout(minuteur);
    if (battement) clearInterval(battement);
  }
  if (res.status === 403) {
    throw new ErreurLocale("Ollama refuse l'extension : règle OLLAMA_ORIGINS (voir README)");
  }
  if (res.status === 404) {
    throw new ErreurLocale(`Modèle "${config.local.modele}" pas installé : lance "ollama pull ${config.local.modele}"`);
  }
  if (!res.ok) throw new ErreurLocale(`IA locale : HTTP ${res.status}`);

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
  return avecFiltreAntiIA((contenu) => appeler(config, systeme, contenu), base, { forme: formeAcheteur(messages) });
}
