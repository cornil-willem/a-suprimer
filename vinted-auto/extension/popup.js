const $ = (id) => document.getElementById(id);
const envoyer = (msg) => chrome.runtime.sendMessage(msg);

async function lire() {
  const { config = {}, etat = {} } = await chrome.storage.local.get(["config", "etat"]);
  return { config, etat };
}

async function majConfig(modif) {
  const { config } = await lire();
  await chrome.storage.local.set({ config: { ...config, ...modif } });
}

function heure(iso) {
  return new Date(iso).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function afficherBrouillons(brouillons = []) {
  const zone = $("brouillons");
  $("nbBrouillons").textContent = brouillons.length ? `(${brouillons.length})` : "";
  if (!brouillons.length) {
    zone.innerHTML = '<p class="doux">Aucun brouillon.</p>';
    return;
  }
  zone.textContent = "";
  for (const b of brouillons) {
    const carte = document.createElement("div");
    carte.className = "carte";

    const titre = document.createElement("div");
    titre.innerHTML = `<b></b> <span class="doux"></span>`;
    titre.querySelector("b").textContent = b.acheteur;
    titre.querySelector("span").textContent = `${b.article || ""} · ${heure(b.date)}`;

    const question = document.createElement("div");
    question.className = "doux";
    question.textContent = `« ${b.question} »`;

    const raison = document.createElement("div");
    if (b.besoinHumain) {
      raison.className = "alerte";
      raison.textContent = `À toi de voir : ${b.raison || "pas sûr de la réponse"}`;
    }

    const texte = document.createElement("textarea");
    texte.rows = 3;
    texte.value = b.reponse || "";
    texte.placeholder = "Écris ta réponse";

    const boutons = document.createElement("div");
    boutons.className = "ligne";
    boutons.style.marginTop = "6px";
    const ok = document.createElement("button");
    ok.className = "principal";
    ok.textContent = "Envoyer";
    ok.onclick = async () => {
      if (!texte.value.trim()) return;
      ok.disabled = true;
      const r = await envoyer({ type: "envoyerBrouillon", id: b.id, texte: texte.value.trim() });
      if (!r?.ok) {
        ok.disabled = false;
        alert(`Pas envoyé : ${r?.raison || "erreur"}`);
      }
    };
    const non = document.createElement("button");
    non.textContent = "Ignorer";
    non.onclick = () => envoyer({ type: "ignorerBrouillon", id: b.id });
    boutons.append(ok, non);

    carte.append(titre, question);
    if (b.besoinHumain) carte.append(raison);
    carte.append(texte, boutons);
    zone.append(carte);
  }
}

function afficherJournal(journal = []) {
  const zone = $("journal");
  zone.textContent = "";
  for (const j of journal.slice(0, 40)) {
    const ligne = document.createElement("div");
    if (j.niveau === "erreur") ligne.className = "erreur";
    ligne.textContent = `${heure(j.date)} · ${j.texte}`;
    zone.append(ligne);
  }
  if (!journal.length) zone.innerHTML = '<p class="doux">Rien pour l’instant.</p>';
}

// Ancienne config sans « vendeur » : c'était le compte de Julie (comme config.js fusionnerConfig).
function vendeurDe(config) {
  if ("vendeur" in config) return config.vendeur;
  return Object.keys(config).length ? "julie" : "";
}

async function rafraichir() {
  const { config, etat } = await lire();
  const vendeur = vendeurDe(config);
  $("vendeur").textContent = vendeur ? `· ${vendeur === "willem" ? "Willem" : "Julie"}` : "";
  if (!vendeur) $("choixVendeur").style.display = "block";
  $("actif").checked = Boolean(config.actif);
  $("mode").value = config.mode || "brouillon";
  const avert = [];
  if (config.moteur === "claude" && !config.apiKey) avert.push("Pas de clé API Claude : ouvre les Options.");
  if (config.mode === "auto") avert.push("Mode auto : les réponses partent sans ta validation.");
  $("avertissement").style.display = avert.length ? "block" : "none";
  $("avertissement").textContent = avert.join(" ");
  afficherBrouillons(etat.brouillons);
  afficherJournal(etat.journal);
}

$("vendeur").onclick = () => {
  $("choixVendeur").style.display = "block";
};
for (const bouton of document.querySelectorAll("[data-vendeur]")) {
  bouton.onclick = async () => {
    const r = await envoyer({ type: "choisirVendeur", vendeur: bouton.dataset.vendeur });
    if (r?.ok) $("choixVendeur").style.display = "none";
    else alert(`Pas changé : ${r?.raison || "erreur"}`);
  };
}
$("actif").onchange = (e) => majConfig({ actif: e.target.checked });
$("mode").onchange = (e) => {
  if (e.target.value === "auto" && !confirm("Mode auto : les réponses seront envoyées sans que tu les relises. Continuer ?")) {
    e.target.value = "brouillon";
    return;
  }
  majConfig({ mode: e.target.value });
};
$("options").onclick = () => chrome.runtime.openOptionsPage();
$("lancer").onclick = async () => {
  $("lancer").disabled = true;
  await envoyer({ type: "lancer" });
  $("lancer").disabled = false;
};
$("diagnostic").onclick = async () => {
  $("diagnostic").disabled = true;
  $("zoneDiagnostic").style.display = "block";
  $("rapport").textContent = "Test en cours...";
  const r = await envoyer({ type: "diagnostic" });
  $("rapport").textContent = JSON.stringify(r, null, 2);
  $("diagnostic").disabled = false;
};
$("copier").onclick = () => navigator.clipboard.writeText($("rapport").textContent);

chrome.storage.onChanged.addListener(rafraichir);
rafraichir();
