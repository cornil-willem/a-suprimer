import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { genererReponseLocale } from "../src/local.js";
import { produireReponse } from "../src/moteur.js";
import { PERSONNALITE_PAR_DEFAUT } from "../src/personnalite.js";

const config = {
  moteur: "local",
  personnalite: PERSONNALITE_PAR_DEFAUT,
  local: { url: "http://localhost:11434/", modele: "mistral-nemo" },
  modeles: { delaiEnvoi: "" },
};
const messages = [{ de: "acheteur", texte: "elle date de quelle année la carte ?" }];
const fetchOriginal = globalThis.fetch;
afterEach(() => (globalThis.fetch = fetchOriginal));

// Faux Ollama : renvoie les réponses données dans l'ordre, et garde les requêtes reçues.
function fauxOllama(...sorties) {
  const requetes = [];
  globalThis.fetch = async (url, init) => {
    requetes.push({ url, corps: JSON.parse(init.body) });
    const s = sorties.shift();
    if (s instanceof Response) return s;
    return new Response(JSON.stringify({ message: { content: JSON.stringify(s) } }), { status: 200 });
  };
  return requetes;
}

test("appel Ollama : modèle, format JSON, personnalité et fiche", async () => {
  const requetes = fauxOllama({ reponse: "aucune idée, j'y connais rien", besoin_humain: true, raison: "année inconnue", memo: "" });
  const r = await genererReponseLocale(config, {
    annonce: "Titre : Lot de 5 cartes",
    messages,
    fiche: { notes: [{ date: "2026-11-20T10:00:00Z", texte: "photos promises" }] },
  });
  assert.equal(r.reponse, "aucune idée, j'y connais rien");
  assert.equal(requetes[0].url, "http://localhost:11434/api/chat");
  const corps = requetes[0].corps;
  assert.equal(corps.model, "mistral-nemo");
  assert.equal(corps.stream, false);
  assert.deepEqual(corps.format.required, ["reponse", "besoin_humain", "raison", "memo"]);
  assert.match(corps.messages[0].content, /compte de Julie/);
  assert.match(corps.messages[0].content, /STYLE INTERDIT/);
  assert.match(corps.messages[1].content, /photos promises/);
});

test("réponse qui sonne IA : réécriture demandée", async () => {
  const requetes = fauxOllama(
    { reponse: "Bonjour ! N'hésitez pas si vous avez d'autres questions !", besoin_humain: false, raison: "", memo: "" },
    { reponse: "je sais pas trop, j'y connais rien", besoin_humain: false, raison: "", memo: "" },
  );
  const r = await genererReponseLocale(config, { annonce: "", messages });
  assert.equal(r.essais, 2);
  assert.equal(r.reponse, "je sais pas trop, j'y connais rien");
  assert.match(requetes[1].corps.messages[1].content, /sonne comme une IA/);
});

test("erreurs Ollama lisibles", async () => {
  globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(genererReponseLocale(config, { annonce: "", messages }), /Ollama n'est pas lancé/);
  fauxOllama(new Response("", { status: 404 }));
  await assert.rejects(genererReponseLocale(config, { annonce: "", messages }), /ollama pull mistral-nemo/);
  fauxOllama(new Response("", { status: 403 }));
  await assert.rejects(genererReponseLocale(config, { annonce: "", messages }), /OLLAMA_ORIGINS/);
});

test("modèle trop lent : abandon avec message clair", async () => {
  globalThis.fetch = (_url, init) =>
    new Promise((_ok, ko) => init.signal.addEventListener("abort", () => ko(new DOMException("stop", "AbortError"))));
  const lent = { ...config, local: { ...config.local, delaiMaxSec: 0.05 } };
  await assert.rejects(genererReponseLocale(lent, { annonce: "", messages }), /trop lente/);
});

test("JSON illisible : rien envoyé, notification", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: "pas du json" } }));
  const r = await genererReponseLocale(config, { annonce: "", messages });
  assert.deepEqual([r.reponse, r.besoin_humain], ["", true]);
});

test("moteur local : modèles d'abord, IA seulement si question pas reconnue", async () => {
  let appels = 0;
  const deps = {
    lireAnnonce: async () => "annonce",
    genererClaude: async () => assert.fail("Claude ne doit pas être appelé"),
    genererLocal: async () => {
      appels++;
      return { reponse: "je regarde et je te dis", besoin_humain: false, raison: "", memo: "", problemes: [], essais: 1 };
    },
  };
  const connue = await produireReponse(config, { messages: [{ de: "acheteur", texte: "c'est des vraies ?" }] }, undefined, deps);
  assert.equal(connue.source, "modeles");
  assert.equal(appels, 0);
  const inconnue = await produireReponse(config, { messages }, undefined, deps);
  assert.equal(inconnue.source, "ia-locale");
  assert.equal(appels, 1);
  const bot = await produireReponse(config, { messages: [{ de: "acheteur", texte: "t'es un bot ?" }] }, undefined, deps);
  assert.deepEqual([bot.source, bot.reponse, appels], ["modeles", "", 1]);
  const gratuit = await produireReponse({ ...config, moteur: "modeles" }, { messages }, undefined, deps);
  assert.deepEqual([gratuit.source, gratuit.reponse, appels], ["modeles", "", 1]);
});
