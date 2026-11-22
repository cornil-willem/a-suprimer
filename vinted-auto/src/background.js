// Service worker de l'extension : planifie et exécute les tâches.
import { CONFIG_PAR_DEFAUT, fusionnerConfig } from "./config.js";
import { Vinted, normaliserConversation, decrireArticle } from "./vinted.js";
import { genererReponse, expliquerErreurClaude } from "./claude.js";
import { genererReponseLocale } from "./local.js";
import { produireReponse, peutPartirSeule } from "./moteur.js";
import { deciderOffre, prixOffreLike } from "./negociation.js";

// ---------- Stockage ----------
const ETAT_VIDE = {
  conversations: {}, // id -> { vu, dernierTraite, planifie: {messageId, a}, tours }
  brouillons: [],
  journal: [],
  likesTraites: {},
  offresLikesJour: { date: "", n: 0 },
  creneauxFaits: {},
  fiches: {}, // acheteur -> { pseudo, notes: [{date, texte}], maj }
};

// Fiche par acheteur : ce qu'il faut retenir d'une conversation à l'autre.
async function ajouterNote(cle, pseudo, texte) {
  const etat = await lireEtat();
  const fiche = etat.fiches[cle] || { pseudo, notes: [] };
  fiche.pseudo = pseudo;
  fiche.notes = [...fiche.notes, { date: new Date().toISOString(), texte }].slice(-10);
  fiche.maj = new Date().toISOString();
  etat.fiches[cle] = fiche;
  const tri = Object.entries(etat.fiches).sort((a, b) => (b[1].maj || "").localeCompare(a[1].maj || ""));
  etat.fiches = Object.fromEntries(tri.slice(0, 300));
  await sauverEtat(etat);
}

async function lireConfig() {
  const { config } = await chrome.storage.local.get("config");
  return fusionnerConfig(config);
}

async function lireEtat() {
  const { etat } = await chrome.storage.local.get("etat");
  return { ...ETAT_VIDE, ...(etat || {}) };
}

async function sauverEtat(etat) {
  await chrome.storage.local.set({ etat });
}

async function journal(texte, niveau = "info") {
  const etat = await lireEtat();
  etat.journal.unshift({ date: new Date().toISOString(), niveau, texte });
  etat.journal = etat.journal.slice(0, 200);
  await sauverEtat(etat);
  if (niveau === "erreur") console.warn(texte);
}

function notifier(titre, texte) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/128.png",
    title: titre,
    message: texte.slice(0, 250),
  });
}

// ---------- Outils ----------
const aleatoire = (min, max) => min + Math.random() * (max - min);

// Pause qui garde le service worker en vie (Chrome le coupe après 30 s sans activité).
async function pause(ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    await new Promise((r) => setTimeout(r, Math.min(10000, fin - Date.now())));
    await chrome.runtime.getPlatformInfo();
  }
}

function dansPlageHoraire(config) {
  const h = new Date().getHours();
  return h >= config.heures.debut && h < config.heures.fin;
}

const aujourdhui = () => new Date().toLocaleDateString("fr-CA"); // AAAA-MM-JJ

let occupe = false;
async function exclusif(nom, fn) {
  if (occupe) return { ok: false, raison: "une tâche tourne déjà" };
  occupe = true;
  try {
    return await fn();
  } catch (e) {
    await journal(`${nom} : ${expliquerErreurClaude(e)}`, "erreur");
    return { ok: false, raison: e?.message || String(e) };
  } finally {
    occupe = false;
  }
}

// ---------- Alarmes ----------
async function programmerAlarmes() {
  const config = await lireConfig();
  await chrome.alarms.clearAll();
  chrome.alarms.create("messages", { periodInMinutes: Math.max(1, config.messages.intervalleMin) });
  chrome.alarms.create("planning", { periodInMinutes: 5 });
}

chrome.runtime.onInstalled.addListener(async () => {
  const { config } = await chrome.storage.local.get("config");
  if (!config) await chrome.storage.local.set({ config: CONFIG_PAR_DEFAUT });
  await programmerAlarmes();
});
chrome.runtime.onStartup.addListener(programmerAlarmes);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.config) programmerAlarmes();
});

chrome.alarms.onAlarm.addListener(async (alarme) => {
  const config = await lireConfig();
  if (!config.actif || !dansPlageHoraire(config)) return;
  if (alarme.name === "messages" && config.messages.actif) {
    await exclusif("Messages", () => passeMessages(config));
  }
  if (alarme.name === "planning") {
    if (config.republication.actif) await exclusif("Republication", () => passeRepublication(config));
    if (config.offresLikes.actif) await exclusif("Offres likes", () => passeOffresLikes(config));
  }
});

// ---------- Messages ----------
async function passeMessages(config, { forcer = false } = {}) {
  if (config.moteur === "claude" && !config.apiKey) {
    await journal("Pas de clé API Claude : renseigne-la dans Options, ou choisis le moteur gratuit", "erreur");
    return { ok: false };
  }
  const v = await new Vinted(config).init();
  const etat = await lireEtat();
  const conversations = await v.listerConversations();
  let traitees = 0;

  for (const resume of conversations) {
    if (traitees >= config.messages.maxParPassage) break;
    const id = String(resume.id);
    const suivi = etat.conversations[id] || {};
    const majVinted = resume.updated_at || resume.updated_at_ts || "";
    // Vérifié le 2026-11-22 : l'inbox renvoie "unread" (pas "is_unread").
    if (!forcer && suivi.vu === majVinted && !(resume.unread ?? resume.is_unread)) continue;

    const conv = normaliserConversation(await v.lireConversation(id), v.userId);
    const dernier = conv.dernier;
    suivi.vu = majVinted;
    etat.conversations[id] = suivi;

    if (!dernier || dernier.de !== "acheteur" || suivi.dernierTraite === dernier.id) continue;

    // Délai humain avant de répondre.
    if (!forcer) {
      if (suivi.planifie?.messageId !== dernier.id) {
        const [mini, maxi] = config.messages.delaiReponseMin;
        suivi.planifie = { messageId: dernier.id, a: Date.now() + aleatoire(mini, maxi) * 60000 };
        continue;
      }
      if (Date.now() < suivi.planifie.a) continue;
    }

    traitees++;
    try {
      if (/offer/.test(dernier.type) && Number.isFinite(dernier.prix)) {
        await traiterOffre(v, config, conv, dernier, suivi);
      } else {
        await traiterMessage(v, config, conv);
      }
      suivi.dernierTraite = dernier.id;
    } catch (e) {
      // Pas marqué comme traité : nouvel essai au prochain passage.
      await journal(`Conversation avec ${conv.acheteur} : ${expliquerErreurClaude(e)}`, "erreur");
    }
    await pause(aleatoire(3000, 9000));
  }

  // Recharge l'état : traiterMessage a pu ajouter des brouillons et du journal entre-temps.
  const frais = await lireEtat();
  frais.conversations = { ...frais.conversations, ...etat.conversations };
  await sauverEtat(frais);
  return { ok: true, traitees };
}

const MOTEURS = { genererClaude: genererReponse, genererLocal: genererReponseLocale };

async function traiterMessage(v, config, conv) {
  const cle = String(conv.acheteurId ?? conv.acheteur);
  const fiche = (await lireEtat()).fiches[cle];
  const r = await produireReponse(config, conv, fiche, {
    ...MOTEURS,
    lireAnnonce: async () => {
      const article = await v.lireArticle(conv.article.id).catch(() => null);
      return article
        ? decrireArticle(article)
        : `Titre : ${conv.article.titre || "(inconnu)"}\n(description non disponible)`;
    },
  });
  if (r.memo) await ajouterNote(cle, conv.acheteur, r.memo);
  const question = conv.dernier.texte;
  if (r.rien) {
    await journal(`${conv.acheteur} : "${question}" (pas besoin de répondre)`);
    return;
  }
  const envoyerAuto = config.mode === "auto" && peutPartirSeule(r, config);

  if (envoyerAuto) {
    await v.envoyerMessage(conv.id, r.reponse);
    await journal(`Répondu à ${conv.acheteur} : "${r.reponse}"`);
  } else {
    const etat = await lireEtat();
    etat.brouillons = etat.brouillons.filter((b) => b.conversationId !== conv.id);
    etat.brouillons.unshift({
      id: crypto.randomUUID(),
      conversationId: conv.id,
      acheteur: conv.acheteur,
      article: conv.article.titre,
      question,
      reponse: r.reponse,
      besoinHumain: r.besoin_humain,
      raison: r.raison,
      date: new Date().toISOString(),
    });
    etat.brouillons = etat.brouillons.slice(0, 50);
    await sauverEtat(etat);
    await journal(`Brouillon pour ${conv.acheteur} : "${r.reponse || "(à toi de répondre)"}"`);
  }

  if (r.besoin_humain) {
    notifier(`${conv.acheteur} : à regarder`, `"${question}"\n${r.raison || ""}`);
  } else if (!envoyerAuto) {
    notifier(`Brouillon prêt pour ${conv.acheteur}`, r.reponse);
  }
}

async function traiterOffre(v, config, conv, offre, suivi) {
  if (!config.negociation.actif) {
    notifier(`Offre de ${conv.acheteur}`, `${offre.prix} € sur "${conv.article.titre}"`);
    await journal(`Offre de ${conv.acheteur} : ${offre.prix} € (négociation auto désactivée)`);
    return;
  }
  let prixAffiche = conv.article.prix;
  if (!Number.isFinite(prixAffiche)) {
    const article = await v.lireArticle(conv.article.id).catch(() => null);
    prixAffiche = Number(article?.price?.amount ?? article?.price);
  }
  const decision = deciderOffre({
    offre: offre.prix,
    prixAffiche,
    prixMinPct: config.negociation.prixMinPct,
    tour: suivi.tours || 0,
  });
  if (decision.action === "accepter") {
    await v.accepterOffre(conv.transactionId, offre.offreId);
  } else if (decision.action === "contre_offre") {
    await v.faireOffre(conv.transactionId, decision.prix);
    suivi.tours = (suivi.tours || 0) + 1;
  }
  await journal(
    `Offre ${conv.acheteur} ${offre.prix} € : ${decision.action}${decision.prix ? ` ${decision.prix} €` : ""} (${decision.raison})`,
  );
}

// ---------- Offres aux personnes qui likent (EXPÉRIMENTAL) ----------
async function passeOffresLikes(config) {
  const v = await new Vinted(config).init();
  const etat = await lireEtat();
  if (etat.offresLikesJour.date !== aujourdhui()) etat.offresLikesJour = { date: aujourdhui(), n: 0 };

  const notifs = await v.listerNotifications();
  const likes = notifs.filter((n) => /favori/i.test(n.body || n.title || "") && !etat.likesTraites[n.id]);
  if (!likes.length) return { ok: true };

  const prixParArticle = new Map((await v.listerArticles()).map((a) => [String(a.id), a]));

  for (const n of likes) {
    if (etat.offresLikesJour.n >= config.offresLikes.maxParJour) break;
    etat.likesTraites[n.id] = true;
    const itemId = String(n.subject_id ?? (n.link || "").match(/items\/(\d+)/)?.[1] ?? "");
    const acheteurId = n.user_id ?? n.actor_id ?? n.user?.id ?? null;
    const article = prixParArticle.get(itemId);
    if (!article || !acheteurId) {
      await journal(`Like ignoré : article ou acheteur introuvable dans la notification ${n.id}`, "erreur");
      continue;
    }
    const prix = prixOffreLike(Number(article.price?.amount ?? article.price), config.offresLikes.remisePct);
    const conv = await v.ouvrirConversationVendeur(Number(itemId), acheteurId);
    await v.faireOffre(conv?.transaction?.id, prix);
    etat.offresLikesJour.n++;
    await journal(`Offre ${prix} € envoyée pour "${article.title}" à quelqu'un qui a liké`);
    await pause(aleatoire(20000, 60000));
  }
  etat.likesTraites = Object.fromEntries(Object.entries(etat.likesTraites).slice(-500));
  const frais = await lireEtat();
  await sauverEtat({ ...frais, likesTraites: etat.likesTraites, offresLikesJour: etat.offresLikesJour });
  return { ok: true };
}

// ---------- Republication (EXPÉRIMENTAL) ----------
function creneauDu(config) {
  const maintenant = new Date();
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
  return config.republication.creneaux.find((c) => {
    const [h, m] = c.split(":").map(Number);
    const debut = h * 60 + m;
    return minutes >= debut && minutes < debut + 30;
  });
}

async function imageEnBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo ${url} : HTTP ${res.status}`);
  const octets = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return { base64: btoa(bin), type: res.headers.get("content-type") || "image/jpeg" };
}

async function republier(v, itemId) {
  const data = await v.lireArticlePourEdition(itemId);
  const uuid = crypto.randomUUID();
  const ids = [];
  for (const photo of data.photos || []) {
    const url = photo.full_size_url || photo.url;
    if (!url) continue;
    const { base64, type } = await imageEnBase64(url);
    const envoi = await v.envoyerPhoto(base64, type, uuid);
    ids.push(envoi.id);
    await pause(aleatoire(1500, 4000));
  }
  if (!ids.length) throw new Error(`aucune photo récupérée pour ${itemId}`);
  // On crée la nouvelle annonce AVANT de supprimer l'ancienne : rien n'est perdu si ça échoue.
  const nouveau = await v.creerArticle(data, ids, uuid);
  if (!nouveau?.id) throw new Error(`nouvelle annonce non créée pour ${itemId}`);
  await v.supprimerArticle(itemId);
  return nouveau;
}

async function passeRepublication(config, { forcer = false } = {}) {
  const creneau = forcer ? "manuel" : creneauDu(config);
  if (!creneau) return { ok: true };
  const cle = `${aujourdhui()} ${creneau}`;
  const etat = await lireEtat();
  if (!forcer && etat.creneauxFaits[cle]) return { ok: true };
  etat.creneauxFaits[cle] = true;
  etat.creneauxFaits = Object.fromEntries(Object.entries(etat.creneauxFaits).slice(-30));
  await sauverEtat(etat);

  const v = await new Vinted(config).init();
  const ageMin = Date.now() - config.republication.ageMinJours * 86400000;
  const candidats = (await v.listerArticles())
    .filter((a) => !a.is_closed && !a.is_reserved && !a.is_hidden && !a.is_draft)
    .map((a) => ({ a, date: (a.created_at_ts ? Date.parse(a.created_at_ts) : 0) || (a.photo?.high_resolution?.timestamp ?? 0) * 1000 }))
    .filter(({ date }) => !date || date < ageMin)
    .sort((x, y) => x.date - y.date)
    .slice(0, config.republication.parCreneau);

  for (const { a } of candidats) {
    try {
      const nouveau = await republier(v, a.id);
      await journal(`Republié "${a.title}" (${a.id} -> ${nouveau.id})`);
    } catch (e) {
      await journal(`Republication "${a.title}" ratée : ${e.message}`, "erreur");
    }
    await pause(aleatoire(30000, 90000));
  }
  return { ok: true, republies: candidats.length };
}

// ---------- Diagnostic ----------
// Ne renvoie que des codes HTTP et des noms de champs : aucun contenu de message.
async function diagnostic(config) {
  const rapport = { date: new Date().toISOString(), etapes: [] };
  const noter = (nom, info) => rapport.etapes.push({ nom, ...info });
  const cles = (o) => (o && typeof o === "object" ? Object.keys(o).slice(0, 40) : null);

  let v;
  try {
    v = await new Vinted(config).init();
    noter("onglet + ID", { ok: true, userIdTrouve: Boolean(v.userId) });
  } catch (e) {
    noter("onglet + ID", { ok: false, erreur: e.message });
    return rapport;
  }

  const tester = async (nom, path) => {
    try {
      const r = await v.get(path);
      noter(nom, { status: r.status, cles: cles(r.json), apercu: r.apercu ? "(non JSON)" : undefined });
      return r.json;
    } catch (e) {
      noter(nom, { ok: false, erreur: e.message });
      return null;
    }
  };

  const inbox = await tester("inbox", "/api/v2/inbox?page=1&per_page=3");
  const c0 = inbox?.conversations?.[0];
  if (c0) {
    noter("inbox.conversations[0]", { cles: cles(c0) });
    const conv = (await tester("conversation", `/api/v2/conversations/${c0.id}`))?.conversation;
    if (conv) {
      noter("conversation.*", {
        cles: cles(conv),
        typesMessages: [...new Set((conv.messages || []).map((m) => m.entity_type))],
        clesMessage: cles(conv.messages?.[0]),
        clesEntite: cles(conv.messages?.[0]?.entity),
        clesEntiteTexte: cles((conv.messages || []).find((m) => m.entity_type === "message")?.entity),
        clesTransaction: cles(conv.transaction),
      });
    }
  }
  const dressing = await tester("dressing", `/api/v2/wardrobe/${v.userId}/items?page=1&per_page=2`);
  const a0 = dressing?.items?.[0];
  if (a0) {
    noter("dressing.items[0]", { cles: cles(a0) });
    await tester("article (item_upload)", `/api/v2/item_upload/items/${a0.id}`);
  }
  const notifs = await tester("notifications", "/api/v2/notifications?page=1&per_page=5");
  if (notifs?.notifications?.[0]) noter("notifications[0]", { cles: cles(notifs.notifications[0]) });
  return rapport;
}

// ---------- Messages du popup et des options ----------
chrome.runtime.onMessage.addListener((msg, _expediteur, repondre) => {
  (async () => {
    const config = await lireConfig();
    switch (msg.type) {
      case "lancer":
        return exclusif("Lancement manuel", () => passeMessages(config, { forcer: true }));
      case "republierMaintenant":
        return exclusif("Republication", () => passeRepublication(config, { forcer: true }));
      case "diagnostic":
        return diagnostic(config);
      case "tester":
        try {
          const messages = msg.historique.map((texte, i) => ({
            de: i % 2 === 0 ? "acheteur" : "moi",
            texte,
          }));
          return await produireReponse(config, { messages }, undefined, {
            ...MOTEURS,
            lireAnnonce: async () => msg.annonce,
          });
        } catch (e) {
          return { erreur: expliquerErreurClaude(e) };
        }
      case "envoyerBrouillon":
        return exclusif("Envoi brouillon", async () => {
          const etat = await lireEtat();
          const b = etat.brouillons.find((x) => x.id === msg.id);
          if (!b) return { ok: false, raison: "brouillon introuvable" };
          const v = await new Vinted(config).init();
          await v.envoyerMessage(b.conversationId, msg.texte);
          const frais = await lireEtat();
          frais.brouillons = frais.brouillons.filter((x) => x.id !== msg.id);
          await sauverEtat(frais);
          await journal(`Envoyé (validé) à ${b.acheteur} : "${msg.texte}"`);
          return { ok: true };
        });
      case "ignorerBrouillon": {
        const etat = await lireEtat();
        etat.brouillons = etat.brouillons.filter((x) => x.id !== msg.id);
        await sauverEtat(etat);
        return { ok: true };
      }
      case "personnaliteDefaut":
        return { texte: CONFIG_PAR_DEFAUT.personnalite };
      case "config":
        return config;
      default:
        return { ok: false, raison: `type inconnu ${msg.type}` };
    }
  })().then(repondre, (e) => repondre({ ok: false, raison: e?.message || String(e) }));
  return true; // réponse asynchrone
});
