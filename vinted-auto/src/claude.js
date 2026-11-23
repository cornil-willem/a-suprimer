// Moteur payant : réponses écrites par Claude (SDK officiel @anthropic-ai/sdk).
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { construireSysteme, construireContenu, avecFiltreAntiIA } from "./prompt.js";
import { formeAcheteur } from "./modeles.js";

const SchemaReponse = z.object({
  reponse: z
    .string()
    .describe("Le message à envoyer à l'acheteur. Chaîne vide si la personne qui gère le compte doit répondre elle-même."),
  besoin_humain: z
    .boolean()
    .describe("true si la personne qui gère le compte doit regarder cette conversation."),
  raison: z.string().describe("Pour la personne qui gère le compte, en quelques mots : pourquoi besoin_humain, sinon vide."),
  memo: z.string().describe("Info utile à retenir sur cet acheteur pour la suite, sinon vide."),
});

// Modèles qui acceptent le repli automatique côté serveur en cas de refus.
const MODELES_AVEC_REPLI = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-2",
  "claude-fable-5-1",
]);

async function appeler(client, config, systeme, contenu) {
  const params = {
    model: config.modele,
    max_tokens: 16000,
    system: [{ type: "text", text: systeme, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: contenu }],
    output_config: { effort: config.effort, format: betaZodOutputFormat(SchemaReponse) },
  };
  if (MODELES_AVEC_REPLI.has(config.modele)) {
    params.betas = ["server-side-fallback-2026-07-01"];
    params.fallbacks = "default";
  }
  const msg = await client.beta.messages.parse(params);
  if (msg.stop_reason === "refusal") {
    return { reponse: "", besoin_humain: true, raison: "Claude a refusé de répondre à ce message", memo: "" };
  }
  if (msg.stop_reason === "max_tokens" || !msg.parsed_output) {
    return { reponse: "", besoin_humain: true, raison: `réponse incomplète (${msg.stop_reason})`, memo: "" };
  }
  return msg.parsed_output;
}

/**
 * Écrit une réponse. Si le filtre anti-IA trouve un problème, Claude réécrit (2 essais de plus max).
 * @returns {Promise<{reponse: string, besoin_humain: boolean, raison: string, memo: string, problemes: object[], essais: number}>}
 */
export async function genererReponse(config, { annonce, messages, fiche }) {
  // Extension perso : la clé reste dans le stockage local de TON Chrome, jamais envoyée ailleurs qu'à Anthropic.
  const client = new Anthropic({ apiKey: config.apiKey, dangerouslyAllowBrowser: true });
  const systeme = construireSysteme(config.personnalite, config);
  const base = construireContenu({ annonce, messages, fiche });
  return avecFiltreAntiIA((contenu) => appeler(client, config, systeme, contenu), base, { forme: formeAcheteur(messages) });
}

// Message d'erreur lisible pour le journal.
export function expliquerErreurClaude(e) {
  if (e instanceof Anthropic.AuthenticationError) return "Clé API Claude invalide (Options)";
  if (e instanceof Anthropic.PermissionDeniedError) return "Clé API sans accès à ce modèle";
  if (e instanceof Anthropic.NotFoundError) return "Modèle Claude introuvable (Options > modèle)";
  if (e instanceof Anthropic.RateLimitError) return "Limite Claude atteinte, réessai au prochain passage";
  if (e instanceof Anthropic.BadRequestError) return `Requête Claude refusée : ${e.message}`;
  if (e instanceof Anthropic.APIError) return `Erreur Claude ${e.status ?? ""} : ${e.message}`;
  return e?.message || String(e);
}
