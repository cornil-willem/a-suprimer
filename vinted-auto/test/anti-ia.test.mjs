import { test } from "node:test";
import assert from "node:assert/strict";
import { verifierTexte, nettoyerTypo } from "../src/anti-ia.js";

const regles = (t) => verifierTexte(t).problemes.map((p) => p.regle);

test("messages humains acceptés", () => {
  for (const t of [
    "oui il est toujours dispo",
    "aucune idée honnêtement, j'y connais rien. je peux t'envoyer une photo si tu veux",
    "ok je regarde ce soir et je te dis",
    "Bonjour, oui c'est une taille unique",
    "je peux pas te le garantir, je l'ai eu d'occasion",
    "fais-moi une offre, je regarde",
    "je passe que par Vinted",
    // Exemples de la personnalité : ils ne doivent pas déclencher le filtre.
    "je m'y connais pas trop et je les récupère chez mon frère, donc ça me dérange pas de les mettre pas cher",
    "honnêtement je sais pas ce que ça vaut, pour moi c'est les cartes qu'on avait petits",
    "j'ai besoin d'un peu d'argent pour mes études, du coup je les mets pas cher",
    "je suis étudiante, j'ai un appart à payer",
    "pour moi oui, c'est mon grand frère qui les collectionnait donc j'imagine. après j'y connais rien, je les récupère juste chez lui",
    "je m'y connais pas vraiment donc je peux pas te garantir",
    "Désolée j'ai tellement de demandes que je peux rien promettre",
    "bah oui elle est dispo",
    "oui je t'envoie ça dans la journée ou demain",
    "je peux pas réserver, c'est le premier qui achète",
  ]) {
    const r = verifierTexte(t);
    assert.equal(r.ok, true, `${t} -> ${JSON.stringify(r.problemes)}`);
  }
});

test("formules de chatbot détectées", () => {
  const r = regles(
    "Bonjour ! Merci pour votre message. N'hésitez pas si vous avez d'autres questions, je reste à votre disposition !",
  );
  for (const attendu of ["merci pour le message", "n'hésite pas", "d'autres questions", "à disposition", "trop de points d'exclamation"]) {
    assert.ok(r.includes(attendu), `manque ${attendu} dans ${r}`);
  }
});

test("vocabulaire et tournures IA détectés", () => {
  assert.ok(regles("Ce manteau intemporel allie élégance et confort").includes("vocabulaire IA"));
  assert.ok(regles("Ce n'est pas juste un sac, c'est une pièce").includes("ce n'est pas X, c'est Y"));
  assert.ok(regles("Il est léger, pratique et solide").includes("liste de trois"));
  assert.ok(regles("De plus, il est en bon état").includes("connecteur de dissertation"));
  assert.ok(regles("En tant qu'assistant je ne sais pas").includes("se présente comme IA"));
  assert.ok(regles("Bien sûr, il est dispo").includes("bien sûr en début"));
});

test("typographie IA corrigée sans réécriture", () => {
  assert.equal(nettoyerTypo("c’est dispo — je l’envoie demain…"), "c'est dispo, je l'envoie demain...");
  assert.equal(nettoyerTypo("**oui** «ok»"), 'oui "ok"');
  assert.equal(verifierTexte("oui — dispo").ok, true);
});

test("pas plus d'un mot d'oral par message", () => {
  assert.ok(regles("ah bah je sais pas").includes("trop de mots d'oral"));
  assert.ok(regles("bah oui, genre 5 cartes").includes("trop de mots d'oral"));
  assert.equal(verifierTexte("ben oui").ok, true);
  assert.equal(verifierTexte("un abonnement").ok, true); // "ben" dans un mot ne compte pas
});

test("longueur, listes et emojis", () => {
  assert.ok(regles("a. ".repeat(150)).includes("trop long"));
  assert.ok(regles("oui.\n- taille M\n- bon état").includes("liste à puces"));
  assert.ok(regles("ok 😊😊").includes("trop d'emojis"));
  assert.ok(regles("😊 ok").includes("emoji en début de message"));
  assert.equal(verifierTexte("ok ça marche 👍").ok, true);
});
