// Choix du moteur de réponse.
//   "modeles" : phrases toutes faites (gratuit).
//   "local"   : phrases toutes faites, et IA locale (Ollama, gratuit) pour les questions pas reconnues.
//   "claude"  : Claude pour tout (payant).
import { repondreAvecModeles, reponsePlusDispo } from "./modeles.js";

/**
 * @param {object} config
 * @param {{messages: object[]}} conv  Conversation normalisée.
 * @param {object|undefined} fiche     Fiche de l'acheteur ({notes: [{date, texte}]}).
 * @param {{lireAnnonce: () => Promise<string>, genererClaude: Function, genererLocal: Function}} deps
 */
export async function produireReponse(config, conv, fiche, deps) {
  // Litige, problème après livraison ou retour sur la commande : aucune réponse automatique, notification.
  if (conv.article?.litige) {
    return {
      reponse: "",
      besoin_humain: true,
      raison: "litige ou retour en cours sur cette commande",
      problemes: [],
      essais: 0,
      regles: ["litige"],
      source: "modeles",
    };
  }
  // Article vendu à quelqu'un d'autre ou supprimé : « désolée, il est plus dispo » une seule fois,
  // puis plus aucune réponse dans cette conversation. L'acheteur, lui, n'est pas concerné
  // (pour lui l'article n'est pas « indisponible », il l'a acheté).
  if (conv.article?.indisponible) return { ...reponsePlusDispo(conv, config), source: "modeles" };
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

/**
 * Mode Auto : une réponse part seule seulement si personne n'a besoin de la relire.
 * Seule exception : la promesse de photos (réponse modèle), envoyée avec une notification
 * pour que les photos partent vraiment. Bot, litige, carte signalée fausse : jamais seule.
 * IA locale : seulement si l'option local.envoiAuto est cochée.
 */
export function peutPartirSeule(r, config = {}) {
  if (!r?.reponse || r.problemes?.length) return false;
  if (r.source === "ia-locale" && !config.local?.envoiAuto) return false;
  if (!r.besoin_humain) return true;
  return r.source === "modeles" && Boolean(r.regles?.includes("photos"));
}

/**
 * Faut-il relire cette conversation ? Oui si elle a changé sur Vinted, si elle est non lue,
 * ou si une réponse prévue n'est pas encore faite (même si Julie l'a lue entre-temps,
 * ou si l'essai précédent a échoué).
 */
export function aRelire(resume, suivi = {}) {
  if (suivi.vu !== (resume.updated_at || resume.updated_at_ts || "")) return true;
  if (resume.unread ?? resume.is_unread) return true;
  return Boolean(suivi.planifie && suivi.planifie.messageId !== suivi.dernierTraite);
}
