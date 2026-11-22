import { test } from "node:test";
import assert from "node:assert/strict";
import { repondreAvecModeles, vouvoyer } from "../src/modeles.js";
import { verifierTexte } from "../src/anti-ia.js";

const conv = (...lignes) => ({
  messages: lignes.map((texte, i) => ({ de: i % 2 === 0 ? "acheteur" : "moi", texte })),
});
const repondre = (...lignes) => repondreAvecModeles(conv(...lignes), { modeles: { delaiEnvoi: "" } });

test("questions reconnues", () => {
  const cas = {
    "c'est des vraies ?": "vraies",
    "Est-ce qu'elles sont authentiques ?": "vraies",
    "pourquoi c'est si peu cher ?": "prixBas",
    "tu peux me réserver le lot ?": "reserver",
    "tu peux m'envoyer plus de photos ?": "photos",
    "c'est ton dernier prix ?": "negocier",
    "tu les as eu où ?": "provenance",
    "c'est toujours dispo ?": "dispo",
    "tu me donnes ton whatsapp ?": "contact",
    "pourquoi tu as besoin d'argent ?": "besoinArgent",
  };
  for (const [question, id] of Object.entries(cas)) {
    const r = repondre(question);
    assert.ok(r.regles.includes(id), `${question} -> ${r.regles}`);
    assert.ok(r.reponse.length > 0, question);
  }
});

test("photos : réponse + notification", () => {
  assert.deepEqual(repondre("tu peux m'envoyer d'autres photos ?").regles, ["photos"]);
  assert.deepEqual(repondre("tu l'envoies quand ?").regles, ["envoi"]);
  assert.deepEqual(repondre("quand est-ce que tu peux envoyer ?").regles, ["envoi"]);
  const r = repondre("tu peux m'envoyer plus de photos ?");
  assert.equal(r.besoin_humain, true);
  assert.match(r.reponse, /envoie/);
});

test("bot, litige, fausses : la main à l'humain", () => {
  assert.deepEqual([repondre("t'es un bot ?").reponse, repondre("t'es un bot ?").besoin_humain], ["", true]);
  assert.equal(repondre("je veux être remboursé").reponse, "");
  for (const q of ["t'es une vraie personne ?", "c'est un humain qui répond ?", "qui m'écrit là ?"]) {
    assert.deepEqual(repondre(q).regles, ["bot"], q);
  }
  const f = repondre("ces cartes sont fausses");
  assert.equal(f.besoin_humain, true);
  assert.match(f.reponse, /garantir/);
});

test("question inconnue : rien envoyé, notification", () => {
  const r = repondre("ton frère les rangeait dans un classeur ?");
  assert.deepEqual([r.reponse, r.besoin_humain], ["", true]);
});

test("simple merci : pas de réponse", () => {
  const r = repondre("ok merci");
  assert.equal(r.rien, true);
  assert.equal(r.besoin_humain, false);
});

test("vouvoiement et bonjour au premier message", () => {
  const r = repondre("Bonjour, est-ce que vous pouvez me réserver la carte ?");
  assert.match(r.reponse, /^Bonjour, /);
  assert.equal(vouvoyer("fais une offre, je regarde"), "faites une offre, je regarde");
  assert.equal(vouvoyer("je peux pas te garantir"), "je peux pas vous garantir");
  // Pas de bonjour quand le compte a déjà répondu
  const suite = repondre("bonjour c'est dispo ?", "oui", "c'est des vraies ?");
  assert.doesNotMatch(suite.reponse, /^Bonjour/);
});

test("deux questions dans le même message", () => {
  const r = repondre("c'est toujours dispo ? et c'est des vraies ?");
  assert.deepEqual(r.regles, ["dispo", "vraies"]);
});

test("pas deux fois la même phrase dans une conversation", () => {
  const premiere = repondre("tu peux réserver ?");
  const seconde = repondre("tu peux réserver ?", premiere.reponse, "allez réserve stp");
  assert.notEqual(seconde.reponse, premiere.reponse);
});

test("toutes les phrases modèles passent le filtre anti-IA", () => {
  for (const q of ["c'est des vraies ?", "pourquoi si peu cher ?", "photos ?", "réserver ?", "dernier prix ?", "tu les as eu où ?", "en quel état ?", "tu fais des échanges ?", "t'en as d'autres ?"]) {
    for (let i = 0; i < 10; i++) {
      const r = repondre(q);
      const v = verifierTexte(r.reponse);
      assert.equal(v.ok, true, `${r.reponse} -> ${JSON.stringify(v.problemes)}`);
    }
  }
});

test("autres façons de demander si c'est un bot", () => {
  for (const q of ["tu es humaine ?", "c'est toi qui écris ?", "je parle à qui là ?", "c'est des réponses auto ?", "Vous êtes une IA ?"]) {
    const r = repondre(q);
    assert.deepEqual([r.regles, r.reponse, r.besoin_humain], [["bot"], "", true], q);
  }
  // "vraies" seul reste une question d'authenticité
  assert.deepEqual(repondre("c'est des vraies cartes ?").regles, ["vraies"]);
});

test("détails, échanges, autres cartes : réponse modèle, rien d'inventé", () => {
  const cas = {
    "elle date de quelle année ?": "details",
    "il y a des cartes holo dans le lot ?": "details",
    "elles sont en quel état les cartes ?": "details",
    "c'est quelle édition ?": "details",
    "ça vaut combien en vrai, c'est quoi leur cote ?": "details",
    "tu fais des échanges ?": "echange",
    "Bonjour, je collectionne depuis longtemps, vous en avez d'autres comme ça ?": "autres",
  };
  for (const [question, id] of Object.entries(cas)) {
    const r = repondre(question);
    assert.deepEqual(r.regles, [id], question);
    assert.equal(r.besoin_humain, false, question);
  }
  for (let i = 0; i < 10; i++) {
    assert.doesNotMatch(repondre("Bonjour, vos cartes sont en quel état ?").reponse, /\bregarde les\b/);
  }
  // Demande de photos de l'état : la promesse de photos, pas "regarde les photos"
  assert.deepEqual(repondre("tu peux m'envoyer des photos de l'état ?").regles, ["photos"]);
  // "à côté" n'est pas une question de cote
  assert.deepEqual(repondre("on peut payer à côté par paypal ?").regles, ["contact"]);
});
