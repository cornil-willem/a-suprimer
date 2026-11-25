import { test } from "node:test";
import assert from "node:assert/strict";
import { appliquerReglagesPc, CONFIG_PAR_DEFAUT } from "../src/config.js";

test("réglages du PC : seulement les clés autorisées", () => {
  const stockee = { ...CONFIG_PAR_DEFAUT, personnalite: "ancienne", local: { ...CONFIG_PAR_DEFAUT.local, delaiMaxSec: 120 } };
  const c = appliquerReglagesPc(stockee, {
    moteur: "local",
    "local.modele": "gemma3:12b",
    "local.delaiMaxSec": 300,
    "modeles.delaiEnvoi": "sous 2 jours",
    personnalite: "defaut",
    "offresLikes.actif": true,
    // Refusés : ils restent un choix fait à la main.
    actif: true,
    mode: "auto",
    apiKey: "x",
    "local.envoiAuto": true,
    "offresLikes.envoiAuto": true,
  });
  assert.equal(c.local.modele, "gemma3:12b");
  assert.equal(c.local.delaiMaxSec, 300);
  assert.equal(c.local.temperature, CONFIG_PAR_DEFAUT.local.temperature, "les autres réglages du groupe restent");
  assert.equal(c.modeles.delaiEnvoi, "sous 2 jours");
  assert.equal(c.personnalite, CONFIG_PAR_DEFAUT.personnalite);
  assert.equal(c.offresLikes.actif, true);
  assert.equal(c.offresLikes.message, true);
  assert.deepEqual([c.actif, c.mode, c.apiKey, c.local.envoiAuto, c.offresLikes.envoiAuto], [false, "brouillon", "", false, false]);
});
test("compte (vendeur) : ancienne config = Julie, nouvelle installation = à choisir, personnalité par compte", async () => {
  const { fusionnerConfig } = await import("../src/config.js");
  const { PERSONNALITE_WILLEM, PERSONNALITE_JULIE } = await import("../src/personnalite.js");
  assert.equal(fusionnerConfig({ actif: true }).vendeur, "julie");
  assert.equal(fusionnerConfig(undefined).vendeur, "");
  assert.equal(fusionnerConfig({ vendeur: "willem" }).vendeur, "willem");
  assert.equal(appliquerReglagesPc({ vendeur: "willem" }, { personnalite: "defaut" }).personnalite, PERSONNALITE_WILLEM);
  assert.equal(appliquerReglagesPc({ actif: false }, { personnalite: "defaut" }).personnalite, PERSONNALITE_JULIE);
  assert.match(PERSONNALITE_WILLEM, /au masculin/);
  assert.match(PERSONNALITE_WILLEM, /grand frère/);
  assert.match(PERSONNALITE_WILLEM, /je suis étudiant"/);
  assert.doesNotMatch(PERSONNALITE_WILLEM, /étudiante|Julie|j'y connais rien|appart/);
});
