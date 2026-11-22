// Accès à Vinted.
//
// Vinted n'a pas d'API publique. On appelle les routes internes du site (/api/v2/...)
// DEPUIS un onglet vinted.fr ouvert dans ton Chrome : mêmes cookies, même IP, même
// navigateur que toi. C'est ce qui évite le blocage anti-bot.
//
// ATTENTION : ces routes ne sont pas documentées et peuvent changer sans prévenir.
// Celles marquées "NON VÉRIFIÉ" n'ont pas encore été testées sur un vrai compte.
// Utilise le bouton "Diagnostic" du popup pour voir ce qui répond.

// ---------- Fonction injectée dans l'onglet Vinted ----------
// Elle doit être autonome : Chrome la sérialise et l'exécute dans la page.
function requetePage({ method, path, body, form }) {
  const lireCookie = (nom) => {
    const m = document.cookie.match(new RegExp("(?:^|; )" + nom + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  };
  let csrf = document.querySelector('meta[name="csrf-token"]')?.content;
  if (!csrf) {
    const m = document.documentElement.innerHTML.match(/CSRF_TOKEN\\?"\s*:\s*\\?"([^"\\]+)/);
    csrf = m ? m[1] : null;
  }
  const headers = { Accept: "application/json, text/plain, */*" };
  if (csrf) headers["X-CSRF-Token"] = csrf;
  const anon = lireCookie("anon_id");
  if (anon) headers["X-Anon-Id"] = anon;

  let payload;
  if (form) {
    payload = new FormData();
    for (const champ of form) {
      if (champ.base64) {
        const bin = atob(champ.base64);
        const octets = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
        payload.append(champ.name, new Blob([octets], { type: champ.type }), champ.filename);
      } else {
        payload.append(champ.name, champ.value);
      }
    }
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  return fetch(path, { method, headers, body: payload, credentials: "include" }).then(
    async (res) => {
      const texte = await res.text();
      let json = null;
      try {
        json = JSON.parse(texte);
      } catch {
        /* réponse non JSON (page anti-bot, HTML...) */
      }
      return { status: res.status, ok: res.ok, json, apercu: json ? null : texte.slice(0, 300) };
    },
  );
}

// ---------- Onglet Vinted ----------
async function attendreChargement(tabId) {
  for (let i = 0; i < 60; i++) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return tab;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("L'onglet Vinted ne finit pas de charger");
}

export async function trouverOnglet(config) {
  const onglets = await chrome.tabs.query({ url: `https://${config.domaine}/*` });
  let tab = onglets.find((t) => !t.discarded) || onglets[0];
  if (tab?.discarded) {
    await chrome.tabs.reload(tab.id);
  }
  if (!tab) {
    if (!config.ouvrirOngletAuto) {
      throw new Error("Aucun onglet Vinted ouvert (ouvre vinted.fr ou active l'ouverture auto)");
    }
    tab = await chrome.tabs.create({
      url: `https://${config.domaine}/inbox`,
      active: false,
      pinned: true,
    });
  }
  // Empêche Chrome de mettre l'onglet en veille.
  await chrome.tabs.update(tab.id, { autoDiscardable: false });
  return attendreChargement(tab.id);
}

export class Vinted {
  constructor(config) {
    this.config = config;
    this.tabId = null;
    this.userId = config.userId ? String(config.userId) : null;
  }

  async init() {
    const tab = await trouverOnglet(this.config);
    this.tabId = tab.id;
    if (!this.userId) {
      const c = await chrome.cookies.get({ url: `https://${this.config.domaine}/`, name: "v_uid" });
      this.userId = c?.value || null;
    }
    if (!this.userId) {
      // Vérifié le 2026-11-22 : /api/v2/users/current renvoie { user: { id, login, ... } }.
      const r = await this.get("/api/v2/users/current").catch(() => null);
      const id = r?.ok ? r.json?.user?.id : null;
      this.userId = id ? String(id) : null;
    }
    if (!this.userId) {
      throw new Error(
        "ID Vinted introuvable : connecte-toi sur Vinted, ou remplis l'ID dans les Options",
      );
    }
    return this;
  }

  async requete(method, path, { body, form } = {}) {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: this.tabId },
      func: requetePage,
      args: [{ method, path, body, form }],
    });
    if (!result) throw new Error(`Pas de réponse pour ${method} ${path}`);
    if (result.status === 401) {
      throw new Error("Vinted : non connecté (401). Reconnecte-toi sur vinted.fr");
    }
    if (result.status === 403 && !result.json) {
      throw new Error("Vinted : bloqué par l'anti-bot (403). Ouvre l'onglet Vinted et fais le captcha");
    }
    return result;
  }

  async get(path) {
    return this.requete("GET", path);
  }

  // ----- Messages (routes vues dans le site web, à confirmer par le diagnostic) -----

  async listerConversations(parPage = 20) {
    const r = await this.get(`/api/v2/inbox?page=1&per_page=${parPage}`);
    if (!r.ok) throw new Error(`inbox : HTTP ${r.status}`);
    return r.json?.conversations || [];
  }

  async lireConversation(id) {
    const r = await this.get(`/api/v2/conversations/${id}`);
    if (!r.ok) throw new Error(`conversation ${id} : HTTP ${r.status}`);
    return r.json?.conversation || null;
  }

  async envoyerMessage(conversationId, texte) {
    const r = await this.requete("POST", `/api/v2/conversations/${conversationId}/replies`, {
      body: {
        reply: { body: texte, photo_temp_uuids: null, is_personal_data_sharing_check_skipped: false },
      },
    });
    if (!r.ok) throw new Error(`envoi message : HTTP ${r.status} ${JSON.stringify(r.json || r.apercu)}`);
    return r.json;
  }

  // ----- Articles -----

  async listerArticles(parPage = 96) {
    const r = await this.get(
      `/api/v2/wardrobe/${this.userId}/items?page=1&per_page=${parPage}&order=relevance`,
    );
    if (!r.ok) throw new Error(`dressing : HTTP ${r.status}`);
    return r.json?.items || [];
  }

  // Annonce complète pour donner le contexte à l'IA. null si illisible.
  // Vérifié le 2026-11-22 : /api/v2/items/{id} renvoie 404, item_upload répond 200 pour ses propres annonces.
  async lireArticle(itemId) {
    if (!itemId) return null;
    for (const path of [`/api/v2/item_upload/items/${itemId}`, `/api/v2/items/${itemId}`]) {
      const r = await this.get(path);
      if (r.ok && r.json?.item) return r.json.item;
    }
    return null;
  }

  // NON VÉRIFIÉ : données d'édition d'une annonce (titre, catégorie, taille, photos...).
  async lireArticlePourEdition(itemId) {
    for (const path of [`/api/v2/item_upload/items/${itemId}`, `/api/v2/items/${itemId}`]) {
      const r = await this.get(path);
      if (r.ok && r.json?.item) return r.json.item;
    }
    throw new Error(`article ${itemId} illisible`);
  }

  // NON VÉRIFIÉ
  async envoyerPhoto(base64, type, uuidSession) {
    const r = await this.requete("POST", "/api/v2/photos", {
      form: [
        { name: "photo[type]", value: "item" },
        { name: "photo[temp_uuid]", value: uuidSession },
        { name: "photo[file]", base64, type, filename: "photo.jpg" },
      ],
    });
    if (!r.ok || !r.json?.id) throw new Error(`upload photo : HTTP ${r.status}`);
    return r.json;
  }

  // NON VÉRIFIÉ
  async creerArticle(item, photoIds, uuidSession) {
    const r = await this.requete("POST", "/api/v2/item_upload/items", {
      body: {
        item: {
          id: null,
          currency: item.currency || "EUR",
          temp_uuid: uuidSession,
          title: item.title,
          description: item.description,
          brand_id: item.brand_id ?? null,
          brand: item.brand ?? null,
          size_id: item.size_id ?? null,
          catalog_id: item.catalog_id,
          isbn: item.isbn ?? null,
          is_unisex: item.is_unisex ?? false,
          status_id: item.status_id,
          video_game_rating_id: item.video_game_rating_id ?? null,
          price: Number(item.price?.amount ?? item.price),
          package_size_id: item.package_size_id,
          shipment_prices: { domestic: null, international: null },
          color_ids: item.color_ids || [item.color1_id, item.color2_id].filter(Boolean),
          assigned_photos: photoIds.map((id) => ({ id, orientation: 0 })),
          measurement_length: item.measurement_length ?? null,
          measurement_width: item.measurement_width ?? null,
          item_attributes: item.item_attributes || [],
          manufacturer: item.manufacturer ?? null,
          manufacturer_labelling: item.manufacturer_labelling ?? null,
        },
        feedback_id: null,
        push_up: false,
        parcel: null,
        upload_session_id: uuidSession,
      },
    });
    if (!r.ok) throw new Error(`création annonce : HTTP ${r.status} ${JSON.stringify(r.json || r.apercu)}`);
    return r.json?.item;
  }

  // NON VÉRIFIÉ
  async supprimerArticle(itemId) {
    const r = await this.requete("POST", `/api/v2/items/${itemId}/delete`);
    if (!r.ok) throw new Error(`suppression ${itemId} : HTTP ${r.status}`);
  }

  // ----- Offres (NON VÉRIFIÉ) -----

  async accepterOffre(transactionId, offreId) {
    const r = await this.requete(
      "PUT",
      `/api/v2/transactions/${transactionId}/offer_requests/${offreId}/accept`,
    );
    if (!r.ok) throw new Error(`accepter offre : HTTP ${r.status}`);
  }

  async faireOffre(transactionId, prix) {
    const r = await this.requete("POST", `/api/v2/transactions/${transactionId}/offers`, {
      body: { offer: { price: prix.toFixed(2), currency: "EUR" } },
    });
    if (!r.ok) throw new Error(`offre : HTTP ${r.status} ${JSON.stringify(r.json || r.apercu)}`);
  }

  async listerNotifications() {
    const r = await this.get(`/api/v2/notifications?page=1&per_page=30`);
    if (!r.ok) throw new Error(`notifications : HTTP ${r.status}`);
    return r.json?.notifications || [];
  }

  async ouvrirConversationVendeur(itemId, acheteurId) {
    const r = await this.requete("POST", `/api/v2/conversations`, {
      body: { initiator: "seller_enters_notification", item_id: itemId, opposite_user_id: acheteurId },
    });
    if (!r.ok) throw new Error(`ouvrir conversation : HTTP ${r.status}`);
    return r.json?.conversation;
  }
}

// ---------- Normalisation ----------
// Transforme une conversation Vinted brute en format simple pour l'IA et pour la logique.
// Vérifié le 2026-11-22 sur un vrai compte : messages[] = { entity_type, entity, created_at_ts, ... }.
//   "message"                          : entity = { id, body, user_id, photos, ... }
//   "status_message", "action_message" : entity = { title, template, ... }, sans id ni user_id.
// transaction = { id, item_id, item_title, status, offer_price, ... } (pas de item_price).
export function normaliserConversation(conv, monId) {
  const messages = (conv.messages || [])
    .map((m) => {
      const e = m.entity || {};
      const auteur = String(e.user_id ?? m.user_id ?? "");
      const base = {
        id: String(m.id ?? e.id ?? `${m.entity_type || "msg"}-${m.created_at_ts ?? ""}`),
        type: m.entity_type || "inconnu",
        de: auteur && auteur === String(monId) ? "moi" : auteur ? "acheteur" : "vinted",
        date: m.created_at_ts || e.created_at_ts || m.created_at || null,
      };
      if (m.entity_type === "message") return { ...base, texte: e.body || "" };
      if (/offer/.test(m.entity_type || "")) {
        return {
          ...base,
          texte: e.title || e.body || "offre",
          prix: Number(e.price?.amount ?? e.price ?? e.offer_price ?? NaN),
          offreId: e.id ?? null,
          statut: e.status ?? e.status_title ?? null,
        };
      }
      return { ...base, texte: e.title || e.body || e.subtitle || "" };
    })
    .filter((m) => m.texte || m.prix);

  const t = conv.transaction || {};
  return {
    id: String(conv.id),
    acheteur: conv.opposite_user?.login || "acheteur",
    acheteurId: conv.opposite_user?.id ?? null,
    transactionId: t.id ?? null,
    article: {
      id: t.item_id ?? conv.item_id ?? null,
      titre: t.item_title || conv.subtitle || "",
      prix: Number(t.item_price?.amount ?? t.item_price ?? NaN),
      statutTransaction: t.status ?? null,
    },
    messages,
    dernier: messages[messages.length - 1] || null,
  };
}

// Version texte d'un article pour le prompt Claude.
export function decrireArticle(item) {
  if (!item) return "(annonce introuvable)";
  const lignes = [
    `Titre : ${item.title ?? ""}`,
    `Prix : ${item.price?.amount ?? item.price ?? "?"} ${item.currency ?? "€"}`,
    item.brand_title || item.brand_dto?.title || typeof item.brand === "string"
      ? `Marque : ${item.brand_title || item.brand_dto?.title || item.brand}`
      : null,
    item.size_title ? `Taille : ${item.size_title}` : null,
    item.status ? `État : ${item.status}` : null,
    `Description : ${item.description ?? "(vide)"}`,
  ];
  return lignes.filter(Boolean).join("\n");
}
