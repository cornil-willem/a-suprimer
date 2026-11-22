import { test } from "node:test";
import assert from "node:assert/strict";
import { deciderOffre, prixOffreLike, arrondirPrix } from "../src/negociation.js";

test("accepte au-dessus du plancher", () => {
  const d = deciderOffre({ offre: 24, prixAffiche: 28, prixMinPct: 80 });
  assert.equal(d.action, "accepter");
});

test("contre-offre au milieu au premier tour", () => {
  const d = deciderOffre({ offre: 15, prixAffiche: 28, prixMinPct: 80 });
  assert.equal(d.action, "contre_offre");
  // plancher 28 x 80 % = 22,40 -> 22 ; milieu (15 + 28) / 2 = 21,5 ; on ne descend pas sous le plancher
  assert.equal(d.prix, 22);
  // milieu au-dessus du plancher : plancher 20, milieu (10 + 40) / 2 = 25
  assert.equal(deciderOffre({ offre: 10, prixAffiche: 40, prixMinPct: 50 }).prix, 25);
});

test("dernier prix = plancher au deuxième tour", () => {
  const d = deciderOffre({ offre: 18, prixAffiche: 28, prixMinPct: 80, tour: 1 });
  assert.deepEqual([d.action, d.prix], ["contre_offre", 22]);
});

test("plancher propre à l'article prioritaire", () => {
  const d = deciderOffre({ offre: 20, prixAffiche: 28, prixMinPct: 80, prixPlancher: 20 });
  assert.equal(d.action, "accepter");
});

test("prix invalides ignorés", () => {
  assert.equal(deciderOffre({ offre: NaN, prixAffiche: 28, prixMinPct: 80 }).action, "ignorer");
});

test("offre aux likes et arrondi", () => {
  assert.equal(prixOffreLike(28, 15), 23.5);
  assert.equal(arrondirPrix(10.99), 10.5);
});
