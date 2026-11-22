import { test } from "node:test";
import assert from "node:assert/strict";
import { normaliserConversation, decrireArticle } from "../src/vinted.js";

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
