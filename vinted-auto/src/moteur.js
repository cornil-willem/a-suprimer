// Choix du moteur de réponse.
//   "modeles" : phrases toutes faites (gratuit).
//   "local"   : phrases toutes faites, et IA locale (Ollama, gratuit) pour les questions pas reconnues.
//   "claude"  : Claude pour tout (payant).
import { repondreAvecModeles } from "./modeles.js";

/**
 * @param {object} config
 * @param {{messages: object[]}} conv  Conversation normalisée.
 * @param {object|undefined} fiche     Fiche de l'acheteur ({notes: [{date, texte}]}).
 * @param {{lireAnnonce: () => Promise<string>, genererClaude: Function, genererLocal: Function}} deps
 */
export async function produireReponse(config, conv, fiche, deps) {
  if (config.moteur === "claude") {
    const r = await deps.genererClaude(config, { annonce: await deps.lireAnnonce(), messages: conv.messages, fiche });
    return { ...r, source: "claude" };
  }
  const modele = repondreAvecModeles(conv, config);
  if (config.moteur === "local" && modele.inconnue) {
    const r = await deps.genererLocal(config, { annonce: await deps.lireAnnonce(), messages: conv.messages, fiche });
    return { ...r, source: "ia-locale" };
  }
  return { ...modele, source: "modeles" };
}
