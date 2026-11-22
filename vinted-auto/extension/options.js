const $ = (id) => document.getElementById(id);
const champs = () => [...document.querySelectorAll("[data-cle]")];

const lireChemin = (obj, chemin) => chemin.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
function ecrireChemin(obj, chemin, valeur) {
  const cles = chemin.split(".");
  let o = obj;
  for (const k of cles.slice(0, -1)) o = o[k];
  o[cles.at(-1)] = valeur;
}

let config = null;

async function charger() {
  config = await chrome.runtime.sendMessage({ type: "config" });
  for (const el of champs()) {
    const v = lireChemin(config, el.dataset.cle);
    if (el.type === "checkbox") el.checked = Boolean(v);
    else if (el.dataset.type === "liste") el.value = (v || []).join(", ");
    else el.value = v ?? "";
  }
}

async function enregistrer() {
  for (const el of champs()) {
    let v;
    if (el.type === "checkbox") v = el.checked;
    else if (el.type === "number") v = Number(el.value);
    else if (el.dataset.type === "liste") v = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else v = el.value.trim();
    ecrireChemin(config, el.dataset.cle, v);
  }
  if (config.messages.delaiReponseMin[1] < config.messages.delaiReponseMin[0]) {
    config.messages.delaiReponseMin.reverse();
  }
  await chrome.storage.local.set({ config });
  $("enregistre").textContent = "Enregistré";
  setTimeout(() => ($("enregistre").textContent = ""), 2000);
}

$("enregistrer").onclick = enregistrer;

$("resetPerso").onclick = async () => {
  if (!confirm("Remplacer ta personnalité par celle par défaut ?")) return;
  const { texte } = await chrome.runtime.sendMessage({ type: "personnaliteDefaut" });
  $("personnalite").value = texte;
};

$("tester").onclick = async () => {
  await enregistrer();
  const sortie = $("resultatTest");
  sortie.style.display = "block";
  sortie.textContent = "Claude écrit...";
  $("tester").disabled = true;
  const historique = $("testMessage").value.split("\n").map((l) => l.trim()).filter(Boolean);
  const r = await chrome.runtime.sendMessage({
    type: "tester",
    annonce: $("testAnnonce").value,
    historique,
  });
  $("tester").disabled = false;
  if (r?.erreur) {
    sortie.textContent = `Erreur : ${r.erreur}`;
    return;
  }
  const lignes = [
    `Réponse : ${r.reponse || "(aucune, tu réponds toi-même)"}`,
    `Besoin de toi : ${r.besoin_humain ? "oui" : "non"}${r.raison ? ` (${r.raison})` : ""}`,
    `Essais : ${r.essais}`,
  ];
  if (r.problemes?.length) {
    lignes.push(`Filtre anti-IA : ${r.problemes.map((p) => `${p.regle} "${p.extrait}"`).join(" ; ")}`);
  }
  sortie.textContent = lignes.join("\n");
};

charger();
