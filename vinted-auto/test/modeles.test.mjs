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

test("plusieurs messages dont un pas reconnu : rien de partiel, l'IA voit tout", () => {
  const r = repondreAvecModeles(
    {
      messages: [
        { de: "acheteur", texte: "C'est possible d'avoir des meilleures photos svp" },
        { de: "acheteur", texte: "Je vous paye 7€" },
      ],
    },
    { modeles: { delaiEnvoi: "" } },
  );
  assert.equal(r.inconnue, true, r.reponse);
  assert.equal(r.reponse, "");
  // Un simple merci à côté d'une question reconnue ne gêne pas.
  const ok = repondreAvecModeles(
    { messages: [{ de: "acheteur", texte: "c'est toujours dispo ?" }, { de: "acheteur", texte: "merci" }] },
    { modeles: { delaiEnvoi: "" } },
  );
  assert.ok(ok.regles.includes("dispo"), ok.regles);
  // « Bonjour » envoyé seul avant la question non plus.
  const salut = repondreAvecModeles(
    { messages: [{ de: "acheteur", texte: "Bonjour !" }, { de: "acheteur", texte: "c'est des vraies ?" }] },
    { modeles: { delaiEnvoi: "" } },
  );
  assert.ok(salut.regles.includes("vraies"), salut.regles);
});

test("acheteur de l'article : réponse sur l'envoi d'après le statut Vinted", async () => {
  const { repondreAvecModeles } = await import("../src/modeles.js");
  const acheteur = (envoi, texte) =>
    repondreAvecModeles(
      { article: { achete: true, envoi }, messages: [{ de: "moi", texte: "ok" }, { de: "acheteur", texte }] },
      { modeles: { delaiEnvoi: "" } },
    );
  assert.match(acheteur("envoye", "c'est envoyé ?").reponse, /parti|envoyé/);
  assert.match(acheteur(null, "tu l'as envoyé ?").reponse, /pas encore/);
  assert.match(acheteur("livre", "le colis est parti ?").reponse, /livré/);
  assert.match(acheteur(null, "vous l'avez envoyé ?").reponse, /pas encore/);
  // Problème de colis : toujours pour l'humain
  assert.equal(acheteur("envoye", "j'ai jamais reçu le colis").besoin_humain, true);
  // Quelqu'un qui n'a pas acheté : pas de réponse sur « sa » commande
  const autre = repondreAvecModeles({ article: {}, messages: [{ de: "acheteur", texte: "c'est envoyé ?" }] }, {});
  assert.notDeepEqual(autre.regles, ["envoiAcheteur"]);
});

test("message aux personnes qui likent : naturel, sans fausse urgence", async () => {
  const { messageLike } = await import("../src/modeles.js");
  for (let i = 0; i < 30; i++) {
    const normal = messageLike({ favoris: 1, seuilPopulaire: 5 });
    assert.match(normal, /^Bonjour, /);
    assert.doesNotMatch(normal, /pas mal/, "pas de « pas mal de likes » si ce n'est pas vrai");
    assert.equal(verifierTexte(normal, { forme: "vous" }).ok, true, normal);
    const populaire = messageLike({ favoris: 8, seuilPopulaire: 5 });
    assert.match(populaire, /pas mal/);
    assert.equal(verifierTexte(populaire, { forme: "vous" }).ok, true, populaire);
  }
});

test("article plus dispo : phrases qui passent le filtre", async () => {
  const { reponsePlusDispo } = await import("../src/modeles.js");
  for (let i = 0; i < 10; i++) {
    const r = reponsePlusDispo({ messages: [{ de: "acheteur", texte: "dispo ?" }] });
    assert.equal(verifierTexte(r.reponse).ok, true, r.reponse);
  }
});

test("prix proposé par message : offre, et « d'autres personnes » seulement si c'est vrai", () => {
  const avec = (n, ...lignes) => repondreAvecModeles({ ...conv(...lignes), article: { autresInteresses: n } }, {});
  for (const q of ["Pour le tout 13€", "13€ ?", "13", "je te propose 10", "tu me le fais à 8€ ?", "possible à 12 ?", "10 euros ça vous va ?", "je prends les 3 pour 10€", "15€ pour le tout ?"]) {
    const r = avec(0, q);
    assert.deepEqual(r.regles, ["prixPropose"], q);
    assert.equal(r.besoin_humain, false, q);
    assert.match(r.reponse, /offre/, q);
    assert.doesNotMatch(r.reponse, /autres personnes|herbe/, q);
  }
  const r = avec(2, "Pour le tout 13€");
  assert.match(r.reponse, /autres personnes/);
  assert.match(r.reponse, /couper l'herbe sous le pied/);
  // Vouvoiement
  assert.match(avec(1, "Bonjour, je vous propose 10€").reponse, /^Bonjour, .*(faites une offre si vous voulez|vous pouvez faire une offre)/);
  // Pas un prix proposé
  for (const q of ["les frais de port c'est 3€ ?", "c'est toujours dispo ?", "tu as 2 cartes en double ?"]) {
    assert.ok(!avec(0, q).regles.includes("prixPropose"), q);
  }
  // Pas deux fois « fais une offre » quand négocier et prix proposé se recoupent
  assert.deepEqual(avec(0, "dernier prix 10€ ?").regles, ["prixPropose"]);
});

test("carte dite fausse dans une autre langue : la main à l'humain", () => {
  for (const q of ["salve posso avere altre foto senza flash fronte retro, perché sembrano false", "are they fake ?", "son falsas ?"]) {
    const r = repondre(q);
    assert.deepEqual([r.regles, r.besoin_humain], [["fausses"], true], q);
  }
});

test("compte de Willem : pas l'histoire de Julie, réponses au masculin", async () => {
  const { reponsePlusDispo } = await import("../src/modeles.js");
  const willem = (...lignes) => repondreAvecModeles(conv(...lignes), { vendeur: "willem", modeles: { delaiEnvoi: "" } });
  for (let i = 0; i < 10; i++) {
    const vraies = willem("c'est des vraies ?").reponse;
    assert.match(vraies, /grand frère/);
    assert.match(vraies, /garantir/);
    assert.doesNotMatch(vraies, /connais/);
    assert.match(willem("tu les as eu où ?").reponse, /grand frère/);
    assert.match(willem("pourquoi si peu cher ?").reponse, /grand frère|étudiant,/);
    assert.equal(willem("pourquoi tu as besoin d'argent ?").reponse, "je suis étudiant");
  }
  const holo = willem("elles sont holo ?");
  assert.equal(holo.reponse, "");
  assert.ok(holo.inconnue, "détails : « j'y connais rien » est à Julie, passe à l'IA");
  const fausse = willem("elles sont fausses");
  assert.deepEqual(fausse.regles, ["fausses"]);
  assert.equal(fausse.reponse, "");
  assert.ok(fausse.besoin_humain);
  for (let i = 0; i < 20; i++) {
    assert.doesNotMatch(willem("tu as un numéro whatsapp ?").reponse, /désolée/);
    assert.doesNotMatch(reponsePlusDispo(conv("dispo ?"), { vendeur: "willem" }).reponse, /désolée/);
  }
  assert.match(willem("toujours dispo ?").reponse, /dispo/);
  // Julie : inchangé.
  assert.match(repondre("c'est des vraies ?").reponse, /frère/);
});
