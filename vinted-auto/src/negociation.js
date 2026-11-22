// Logique de négociation pure (testée dans test/negociation.test.mjs).
// Aucune requête Vinted ici : on décide seulement quoi faire d'une offre.

// Arrondi au 0,50 € inférieur, comme un humain.
export function arrondirPrix(prix) {
  return Math.floor(prix * 2) / 2;
}

/**
 * @param {object} p
 * @param {number} p.offre        Prix proposé par l'acheteur.
 * @param {number} p.prixAffiche  Prix de l'annonce.
 * @param {number} p.prixMinPct   % du prix affiché accepté sans discuter.
 * @param {number} [p.prixPlancher] Prix minimum propre à l'article (prioritaire sur prixMinPct).
 * @param {number} [p.tour]       Nombre de contre-offres déjà faites dans cette conversation.
 * @returns {{action: "accepter"|"contre_offre"|"ignorer", prix?: number, raison: string}}
 */
export function deciderOffre({ offre, prixAffiche, prixMinPct, prixPlancher, tour = 0 }) {
  if (!(offre > 0) || !(prixAffiche > 0)) {
    return { action: "ignorer", raison: "prix invalide" };
  }
  const plancher = arrondirPrix(
    prixPlancher > 0 ? prixPlancher : (prixAffiche * prixMinPct) / 100,
  );

  if (offre >= plancher) {
    return { action: "accepter", raison: `offre ${offre} >= plancher ${plancher}` };
  }

  // Deuxième contre-offre ou plus : on propose directement le plancher, c'est le dernier mot.
  if (tour >= 1) {
    return { action: "contre_offre", prix: plancher, raison: "dernier prix (plancher)" };
  }

  // Premier tour : on coupe la poire en deux entre l'offre et le prix affiché,
  // sans descendre sous le plancher ni dépasser le prix affiché.
  const milieu = arrondirPrix((offre + prixAffiche) / 2);
  const prix = Math.min(prixAffiche, Math.max(plancher, milieu));
  return { action: "contre_offre", prix, raison: `milieu entre ${offre} et ${prixAffiche}` };
}

// Prix de l'offre envoyée aux personnes qui ont liké.
export function prixOffreLike(prixAffiche, remisePct) {
  return arrondirPrix(prixAffiche * (1 - remisePct / 100));
}
