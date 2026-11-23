import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserConversation, decrireArticle, etatEnvoi, likesDepuisNotifications, hoteApi, Vinted } from "../src/vinted.js";
import { produireReponse } from "../src/moteur.js";
import { repondreAvecModeles } from "../src/modeles.js";

// Forme relevée sur un vrai compte le 2026-11-22 (contenus inventés).
const MOI = 111;
const conversation = {
  id: 9001,
  subtitle: "Lot de 5 cartes Pokémon",
  opposite_user: { id: 222, login: "acheteur_test", photo: null, badge: null },
  transaction: { id: 333, status: 10, item_id: 444, item_title: "Lot de 5 cartes Pokémon", offer_price: { amount: "5.0" } },
  messages: [
    { entity_type: "status_message", entity: { title: "Achat en cours", template: "x" }, created_at_ts: "2026-11-20T10:00:00+01:00" },
    { entity_type: "message", entity: { id: 1, body: "bonjour c'est dispo ?", user_id: 222, photos: [] }, created_at_ts: "2026-11-20T10:01:00+01:00" },
    { entity_type: "message", entity: { id: 2, body: "oui toujours dispo", user_id: 111, photos: [] }, created_at_ts: "2026-11-20T10:05:00+01:00" },
    { entity_type: "message", entity: { id: 3, body: "c'est des vraies ?", user_id: 222, photos: [] }, created_at_ts: "2026-11-20T10:06:00+01:00" },
  ],
};

test("conversation réelle : auteurs, ids, article", () => {
  const c = normaliserConversation(conversation, MOI);
  assert.deepEqual(c.messages.map((m) => m.de), ["vinted", "acheteur", "moi", "acheteur"]);
  assert.deepEqual(c.messages.map((m) => m.id).slice(1), ["1", "2", "3"]);
  assert.ok(c.messages[0].id, "un message système a quand même un id");
  assert.equal(c.dernier.texte, "c'est des vraies ?");
  assert.equal(c.dernier.de, "acheteur");
  assert.deepEqual([c.acheteur, c.acheteurId, c.transactionId], ["acheteur_test", 222, 333]);
  assert.deepEqual([c.article.id, c.article.titre], [444, "Lot de 5 cartes Pokémon"]);
});

test("message système en dernier : pas de réponse", () => {
  const fin = { ...conversation, messages: [...conversation.messages, { entity_type: "action_message", entity: { title: "Laisse une évaluation" }, created_at_ts: "2026-11-21T09:00:00+01:00" }] };
  assert.equal(normaliserConversation(fin, MOI).dernier.de, "vinted");
});

test("annonce lue par item_upload", () => {
  const texte = decrireArticle({ title: "Lot de 5 cartes", price: "5.0", currency: "EUR", brand_dto: { title: "Pokémon" }, description: "lot" });
  assert.match(texte, /Titre : Lot de 5 cartes/);
  assert.match(texte, /Prix : 5\.0 EUR/);
  assert.match(texte, /Marque : Pokémon/);
});

test("article vendu à un autre ou supprimé : indisponible", () => {
  assert.equal(normaliserConversation(conversation, MOI).article.indisponible, false);
  // Forme relevée le 2026-11-22 : item_is_closed sans achat, et message Vinted « plus disponible ».
  const fermee = {
    ...conversation,
    transaction: { ...conversation.transaction, item_is_closed: true, purchase_id: null },
    messages: [
      conversation.messages[1],
      { entity_type: "action_message", entity: { template: "x", title: "Cet article n'est plus disponible", subtitle: "Cet article a été vendu ou supprimé" } },
      { entity_type: "message", entity: { id: 9, body: "Je vous paye 7€", user_id: 222, photos: [] } },
    ],
  };
  assert.equal(normaliserConversation(fermee, MOI).article.indisponible, true);
  const seulMessage = { ...fermee, transaction: conversation.transaction };
  assert.equal(normaliserConversation(seulMessage, MOI).article.indisponible, true);
});

// ---------- Achat, envoi, litige : forme relevée le 2026-11-23 sur 16 vraies conversations (contenus inventés) ----------
const systeme = (entity_type, title, subtitle) => ({ entity_type, entity: { title, template: "x", interpolation_values: [], ...(subtitle ? { subtitle } : {}) } });
const titres = (...t) => t.map((x) => ({ de: "vinted", texte: x }));
const transactionAchat = {
  id: 333, status: 450, offline_verification: false, offer_id: 77, buyer_id: 222, seller_id: 111, is_completed: true,
  shipping_order_id: 88, purchase_id: "a1b2c3", has_warranty: false, available_actions: ["delete_thread"], current_user_side: "seller",
  is_bundle: false, is_reserved: false, is_business_seller: false, item_count: 1, item_id: 444, item_ids: [444],
  item_title: "Lot de 5 cartes Pokémon", item_photo: {}, item_url: "https://www.vinted.fr/items/444", item_is_closed: true,
  offer_price: { amount: "5.0", currency_code: "EUR" }, service_fee: {}, total_amount_without_tax: {}, closet_countdown_end_date: null,
  seller_bundle_discount: null, seller_item_count: 35, seller_city: "Ville", shipment_id: 99, shipment_status: 400, package_size_code: "S",
};
const venteLivree = {
  ...conversation,
  transaction: transactionAchat,
  messages: [
    systeme("status_message", "Vendu"),
    { entity_type: "message", entity: { id: 21, body: "merci !", user_id: 222, photos: [] } },
    systeme("status_message", "Commande envoyée"),
    systeme("status_message", "Livrée"),
    systeme("status_message", "Evaluation ajoutée"),
    systeme("action_message", "Ta vente est finalisée."),
    { entity_type: "message", entity: { id: 22, body: "c'est bien envoyé ?", user_id: 222, photos: [] } },
  ],
};

test("acheteur réel : purchase_id, envoi lu dans les messages Vinted", () => {
  const c = normaliserConversation(venteLivree, MOI);
  assert.equal(c.article.achete, true);
  assert.equal(c.article.envoi, "livre");
  assert.equal(c.article.litige, false);
  assert.equal(c.article.indisponible, false);
  const r = repondreAvecModeles(c, {});
  assert.deepEqual(r.regles, ["envoiAcheteur"]);
  assert.match(r.reponse, /livr/);
});

test("sans achat : purchase_id null, buyer_id ne compte pas", () => {
  const c = normaliserConversation({ ...conversation, transaction: { ...transactionAchat, purchase_id: null, shipment_status: null, status: 500 } }, MOI);
  assert.equal(c.article.achete, false);
});

test("textes Vinted réels : état de l'envoi", () => {
  assert.equal(etatEnvoi(titres("Vendu", "Article à emballer et envoyer (avant le 30 nov. 10:00)")), null, "« envoyer » n'est pas « envoyé »");
  assert.equal(etatEnvoi(titres("Vendu", "Colis envoyé à l’acheteur. ")), "envoye");
  assert.equal(etatEnvoi(titres("Vendu", "Commande envoyée")), "envoye");
  assert.equal(etatEnvoi(titres("Vendu", "Commande envoyée", "Livrée")), "livre");
  assert.equal(etatEnvoi(titres("Vendu", "Commande envoyée", "Livrée", "Evaluation ajoutée", "Ta vente est finalisée.")), "livre");
  assert.equal(etatEnvoi(titres("Vendu", "L'acheteur a annulé la commande", "Article remis en ligne")), "annule");
  assert.equal(etatEnvoi(titres("Vendu", "Commande envoyée", "Livrée", "Problème après la livraison", "Retourné")), "probleme");
  assert.equal(etatEnvoi(titres("Vendu", "Ton colis est arrivé !", "Commande en cours de retour")), "probleme");
  assert.equal(etatEnvoi([{ de: "acheteur", texte: "tu l'as envoyé ?" }]), null, "seuls les messages Vinted comptent");
});

test("commande annulée : plus considérée comme achetée", () => {
  const annulee = {
    ...conversation,
    transaction: { ...transactionAchat, is_completed: false, shipment_status: 500, status: 520 },
    messages: [systeme("status_message", "Vendu"), systeme("status_message", "L'acheteur a annulé la commande"), systeme("action_message", "Article remis en ligne", "L'article est de nouveau visible sur le catalogue !")],
  };
  const c = normaliserConversation(annulee, MOI);
  assert.equal(c.article.envoi, "annule");
  assert.equal(c.article.achete, false);
  assert.equal(c.article.indisponible, false);
});

test("litige ou retour : aucune réponse automatique, notification", async () => {
  const litige = {
    ...conversation,
    transaction: { ...transactionAchat, is_completed: false, status: 520 },
    messages: [
      systeme("status_message", "Vendu"),
      systeme("status_message", "Commande envoyée"),
      systeme("status_message", "Livrée"),
      systeme("status_message", "Problème après la livraison", "<a href=\"/issue_details/1\">Voir les détails du litige</a>"),
      systeme("action_message", "Retourné"),
      { entity_type: "message", entity: { id: 31, body: "c'est des vraies ?", user_id: 222, photos: [] } },
    ],
  };
  const c = normaliserConversation(litige, MOI);
  assert.equal(c.article.litige, true);
  const deps = { lireAnnonce: async () => "", genererLocal: async () => assert.fail("pas d'IA"), genererClaude: async () => assert.fail("pas d'IA") };
  const r = await produireReponse({ moteur: "local" }, c, undefined, deps);
  assert.equal(r.reponse, "");
  assert.equal(r.besoin_humain, true);
  assert.match(r.raison, /litige/);
});

// ---------- Likes : forme relevée le 2026-11-23 (api.vinted.fr/inbox-notifications/v1/notifications) ----------
test("likes lus dans les notifications", () => {
  const notifications = [
    { id: "n1", entry_type: 20, body: "camille_75 a ajouté ton article Lot pokemon à ses favoris.", is_read: true, link: "vintedfr://messaging?item_id=444&user_id=555&portal=fr", subject_id: 444, user_id: 111, updated_at: "2026-11-22T13:00:15+00:00", photo: {}, photo_type: "item", small_photo_url: "" },
    { id: "n2", entry_type: 290, body: "Laisser une évaluation à quelqu'un pour l'article \"Lot\"", link: "vintedfr://user/leave_transaction_feedback?transaction_id=1", subject_id: 1, user_id: 111 },
  ];
  assert.deepEqual(likesDepuisNotifications(notifications), [{ id: "n1", itemId: "444", userId: "555", login: "camille_75" }]);
  assert.equal(hoteApi("www.vinted.fr"), "https://api.vinted.fr");
});

test("écrire à quelqu'un qui a liké : requête du site (inquiries)", async () => {
  const v = new Vinted({ domaine: "www.vinted.fr" });
  const appels = [];
  v.requete = async (method, path, opts) => {
    appels.push({ method, path, body: opts?.body });
    return path.endsWith("/inquiries") ? { status: 200, ok: true, json: { conversation_id: "01ab-uuid", transaction_id: "987" } } : { status: 200, ok: true, json: { id: "m1" } };
  };
  const conv = await v.ouvrirConversationVendeur("444", "555");
  assert.deepEqual(conv, { id: "01ab-uuid", transactionId: "987" });
  assert.deepEqual(appels[0], { method: "POST", path: "https://api.vinted.fr/messaging/main/inquiries", body: { item_ids: ["444"], receiver_id: "555" } });
  await v.envoyerMessage(conv.id, "Bonjour");
  assert.deepEqual(appels[1], {
    method: "POST",
    path: "https://api.vinted.fr/messaging/main/conversations/01ab-uuid/replies",
    body: { content: "Bonjour", is_personal_data_sharing_check_skipped: false, photo_temp_uuids: null },
  });
  assert.equal(appels.length, 2, "un seul envoi");
});

test("envoi : ancienne route seulement si la nouvelle n'existe pas", async () => {
  const v = new Vinted({ domaine: "www.vinted.fr" });
  const chemins = [];
  v.requete = async (_m, path) => {
    chemins.push(path);
    return path.startsWith("https://") ? { status: 404, ok: false, json: null } : { status: 200, ok: true, json: {} };
  };
  await v.envoyerMessage(9001, "ok");
  assert.deepEqual(chemins, ["https://api.vinted.fr/messaging/main/conversations/9001/replies", "/api/v2/conversations/9001/replies"]);
  // Refus (403) : pas de second essai, erreur.
  chemins.length = 0;
  v.requete = async (_m, path) => (chemins.push(path), { status: 403, ok: false, json: { code: "ACCESS_DENIED" } });
  await assert.rejects(() => v.envoyerMessage(9001, "ok"), /HTTP 403/);
  assert.equal(chemins.length, 1);
});
