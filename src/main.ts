import { StockApi } from "./api";
import {
  commitArticleDelete,
  commitArticleUpdate,
  commitMovement,
  commitNewArticle,
  getArticles,
  getQueue,
  removeCommand,
  replaceArticlesIfQueueEmpty
} from "./db";
import { BarcodeScanner } from "./scanner";
import type { Article, StockCommand } from "./types";
import "./styles.css";

type Screen = "stock" | "scan";
type Language = "en" | "fr";

const translations = {
  en: {
    offline: "Offline",
    syncing: "Syncing",
    localOnly: "Local only",
    online: "Online",
    inStock: "in stock",
    noMatches: "No matches found",
    emptyStock: "Your stockroom is empty",
    tryDifferentSearch: "Try another name or barcode.",
    scanFirstBarcode: "Scan your first barcode to add an article.",
    yourStorage: "YOUR STORAGE",
    stockOverview: "Stock overview",
    connectionSettings: "Connection settings",
    totalUnits: "Total units on hand",
    articles: "Articles",
    allArticles: "All articles",
    syncingButton: "Syncing…",
    syncCount: "Sync {count}",
    sync: "↻ Sync",
    searchPlaceholder: "Search name or barcode",
    productSearch: "Find an article",
    productSearchPlaceholder: "Search by product name",
    noArticlesFound: "No articles match your search.",
    selectArticle: "Select article",
    localNote: "Your stock is saved on this device. Connect a Google Sheet to sync across devices.",
    newArticle: "NEW ARTICLE",
    barcodeUnknown: "Barcode not recognized",
    barcode: "Barcode",
    createHandmade: "Create a handmade article",
    internalBarcodeInfo: "Generate an internal barcode and print a label to attach to this item.",
    generateBarcode: "Generate barcode",
    barcodeGenerationFailed: "Could not generate the barcode. Please try again.",
    printLabel: "Print label",
    internalBarcode: "Internal barcode",
    barcodeNotGenerated: "Not generated yet",
    articleName: "Article name",
    editStock: "Adjust",
    adjustArticleStock: "Adjust stock for {name}",
    startingQuantity: "Starting quantity",
    newArticlePlaceholder: "e.g. Storage box, medium",
    createArticle: "Create article",
    cancel: "Cancel",
    articleFound: "ARTICLE FOUND",
    editArticle: "Edit name / barcode",
    saveArticleChanges: "Save changes",
    deleteArticle: "Delete article",
    deleteArticleConfirm: "Permanently delete {name} from your stock? This cannot be undone.",
    articleUpdated: "{name} updated.",
    articleDeleted: "{name} deleted.",
    duplicateBarcode: "Another article already uses this barcode.",
    currentStock: "Current stock",
    units: "units",
    movementType: "Movement type",
    addStock: "Add stock",
    increaseQuantity: "Increase quantity",
    removeStock: "Remove stock",
    decreaseQuantity: "Decrease quantity",
    quantity: "Quantity",
    confirmMovement: "Confirm movement",
    scanAnother: "Scan another article",
    stockMovement: "STOCK MOVEMENT",
    scanMove: "Scan & move",
    pointBarcode: "Point at a barcode",
    scanHint: "Hold the barcode steady inside the frame. It will scan automatically.",
    flashOff: "Flash off",
    flashOn: "Flash on",
    flashFailed: "Could not toggle the flash: {error}",
    orEnterManually: "or enter manually",
    enterBarcode: "Enter barcode",
    barcodePlaceholder: "Type or paste a barcode",
    findArticle: "Find article",
    worksOffline: "Works offline",
    offlineQueueHint: "Your changes are saved on this device and queued to sync later.",
    cloudSync: "CLOUD SYNC",
    connectSheet: "Connect your stock sheet",
    settingsDescription: "Paste the web app URL from your Google Apps Script deployment. You can keep using Stockroom offline until it is ready.",
    appsScriptUrl: "Apps Script web app URL",
    saveConnection: "Save connection",
    accessMatters: "Access matters.",
    securityDescription: "Restrict the Apps Script deployment to your Google account or organization where possible. Anyone who can open a publicly accessible endpoint could change stock.",
    disconnect: "Disconnect this device",
    close: "Close",
    mainNavigation: "Main navigation",
    stockroomHome: "Stockroom home",
    stockNav: "Stock",
    scanNav: "Scan & move",
    installApp: "＋ Install app",
    connectFirst: "Connect a Google Sheet first.",
    barcodeTooLong: "This barcode is too long to save.",
    invalidBarcode: "Enter a barcode.",
    wholeNumber: "Enter a whole number for the quantity.",
    articleNameRequired: "Enter an article name.",
    startingQuantityNegative: "Starting quantity cannot be negative.",
    articleAdded: "{name} added to your stock.",
    articleMissing: "This article is no longer in your local stock.",
    minimumQuantity: "Enter a quantity of at least 1.",
    chooseMovement: "Choose whether to add or remove stock.",
    availableUnits: "Only {count} units are currently available.",
    quantityRange: "The resulting stock quantity is outside the supported range.",
    addedOne: "Added 1 unit to {name}.",
    addedMany: "Added {count} units to {name}.",
    removedOne: "Removed 1 unit from {name}.",
    removedMany: "Removed {count} units from {name}.",
    enterDeploymentUrl: "Enter a valid Apps Script deployment URL.",
    httpsDeploymentUrl: "Use the HTTPS web app URL from script.google.com.",
    connectionSaved: "Connection saved. Syncing your stock…",
    saveFailed: "Could not save this change.",
    stockUpToDate: "Stock is up to date.",
    syncPaused: "Sync paused: {error}",
    syncFailed: "Sync failed unexpectedly.",
    connectionRemoved: "Sheet connection removed from this device. Local stock is unchanged.",
    cameraUnavailable: "Camera unavailable: {error}. Enter the barcode manually instead.",
    cameraUnavailableFallback: "Camera unavailable. Enter the barcode manually instead.",
    localStockLoadFailed: "Could not load local stock.",
    dismissNotice: "Dismiss",
    showFrench: "Afficher en français",
    showEnglish: "Display in English",
    french: "FR",
    english: "EN",
    documentTitle: "Stockroom — Stock manager",
    description: "A simple, offline-ready stock manager for your warehouse."
  },
  fr: {
    offline: "Hors ligne",
    syncing: "Synchronisation",
    localOnly: "Local uniquement",
    online: "En ligne",
    inStock: "en stock",
    noMatches: "Aucun résultat",
    emptyStock: "Votre stock est vide",
    tryDifferentSearch: "Essayez un autre nom ou code-barres.",
    scanFirstBarcode: "Scannez votre premier code-barres pour ajouter un article.",
    yourStorage: "VOTRE ENTREPÔT",
    stockOverview: "Vue du stock",
    connectionSettings: "Paramètres de connexion",
    totalUnits: "Unités en stock",
    articles: "Articles",
    allArticles: "Tous les articles",
    syncingButton: "Synchronisation…",
    syncCount: "Synchroniser ({count})",
    sync: "↻ Synchroniser",
    searchPlaceholder: "Rechercher par nom ou code-barres",
    productSearch: "Rechercher un article",
    productSearchPlaceholder: "Rechercher par nom de produit",
    noArticlesFound: "Aucun article ne correspond à votre recherche.",
    selectArticle: "Sélectionner l’article",
    localNote: "Votre stock est enregistré sur cet appareil. Connectez une feuille Google pour synchroniser vos appareils.",
    newArticle: "NOUVEL ARTICLE",
    barcodeUnknown: "Code-barres inconnu",
    barcode: "Code-barres",
    createHandmade: "Créer un article fait main",
    internalBarcodeInfo: "Générez un code-barres interne et imprimez une étiquette à coller sur cet article.",
    generateBarcode: "Générer un code-barres",
    barcodeGenerationFailed: "Impossible de générer le code-barres. Veuillez réessayer.",
    printLabel: "Imprimer l’étiquette",
    internalBarcode: "Code-barres interne",
    barcodeNotGenerated: "Pas encore généré",
    articleName: "Nom de l’article",
    editStock: "Modifier",
    adjustArticleStock: "Modifier le stock de {name}",
    startingQuantity: "Quantité initiale",
    newArticlePlaceholder: "ex. Boîte de rangement, moyenne",
    createArticle: "Créer l’article",
    cancel: "Annuler",
    articleFound: "ARTICLE TROUVÉ",
    editArticle: "Modifier le nom / code-barres",
    saveArticleChanges: "Enregistrer",
    deleteArticle: "Supprimer l’article",
    deleteArticleConfirm: "Supprimer définitivement {name} de votre stock ? Cette action est irréversible.",
    articleUpdated: "{name} a été modifié.",
    articleDeleted: "{name} a été supprimé.",
    duplicateBarcode: "Un autre article utilise déjà ce code-barres.",
    currentStock: "Stock actuel",
    units: "unités",
    movementType: "Type de mouvement",
    addStock: "Ajouter du stock",
    increaseQuantity: "Augmenter la quantité",
    removeStock: "Retirer du stock",
    decreaseQuantity: "Diminuer la quantité",
    quantity: "Quantité",
    confirmMovement: "Confirmer le mouvement",
    scanAnother: "Scanner un autre article",
    stockMovement: "MOUVEMENT DE STOCK",
    scanMove: "Scanner et gérer",
    pointBarcode: "Visez un code-barres",
    scanHint: "Maintenez le code-barres dans le cadre. Il sera scanné automatiquement.",
    flashOff: "Flash désactivé",
    flashOn: "Flash activé",
    flashFailed: "Impossible de changer le flash : {error}",
    orEnterManually: "ou saisir manuellement",
    enterBarcode: "Saisir le code-barres",
    barcodePlaceholder: "Saisir ou coller un code-barres",
    findArticle: "Rechercher l’article",
    worksOffline: "Fonctionne hors ligne",
    offlineQueueHint: "Vos modifications sont enregistrées sur cet appareil et seront synchronisées plus tard.",
    cloudSync: "SYNCHRONISATION EN LIGNE",
    connectSheet: "Connecter votre feuille de stock",
    settingsDescription: "Collez l’URL de l’application web déployée depuis Google Apps Script. Stockroom reste utilisable hors ligne en attendant.",
    appsScriptUrl: "URL de l’application web Apps Script",
    saveConnection: "Enregistrer la connexion",
    accessMatters: "Attention aux accès.",
    securityDescription: "Dans la mesure du possible, limitez l’accès au déploiement Apps Script à votre compte Google ou à votre organisation. Toute personne pouvant accéder à une URL publique pourrait modifier le stock.",
    disconnect: "Déconnecter cet appareil",
    close: "Fermer",
    mainNavigation: "Navigation principale",
    stockroomHome: "Accueil Stockroom",
    stockNav: "Stock",
    scanNav: "Scanner",
    installApp: "＋ Installer l’application",
    connectFirst: "Connectez d’abord une feuille Google.",
    barcodeTooLong: "Ce code-barres est trop long pour être enregistré.",
    invalidBarcode: "Saisissez un code-barres.",
    wholeNumber: "Saisissez un nombre entier pour la quantité.",
    articleNameRequired: "Saisissez le nom de l’article.",
    startingQuantityNegative: "La quantité initiale ne peut pas être négative.",
    articleAdded: "{name} ajouté à votre stock.",
    articleMissing: "Cet article n’existe plus dans votre stock local.",
    minimumQuantity: "Saisissez une quantité d’au moins 1.",
    chooseMovement: "Choisissez d’ajouter ou de retirer du stock.",
    availableUnits: "Seules {count} unités sont actuellement disponibles.",
    quantityRange: "La quantité de stock obtenue dépasse la limite autorisée.",
    addedOne: "1 unité ajoutée à {name}.",
    addedMany: "{count} unités ajoutées à {name}.",
    removedOne: "1 unité retirée de {name}.",
    removedMany: "{count} unités retirées de {name}.",
    enterDeploymentUrl: "Saisissez une URL de déploiement Apps Script valide.",
    httpsDeploymentUrl: "Utilisez l’URL HTTPS de l’application web sur script.google.com.",
    connectionSaved: "Connexion enregistrée. Synchronisation du stock…",
    saveFailed: "Impossible d’enregistrer cette modification.",
    stockUpToDate: "Le stock est à jour.",
    syncPaused: "Synchronisation interrompue : {error}",
    syncFailed: "Échec inattendu de la synchronisation.",
    connectionRemoved: "La connexion à la feuille a été supprimée de cet appareil. Le stock local est conservé.",
    cameraUnavailable: "Caméra indisponible : {error}. Saisissez plutôt le code-barres manuellement.",
    cameraUnavailableFallback: "Caméra indisponible. Saisissez plutôt le code-barres manuellement.",
    localStockLoadFailed: "Impossible de charger le stock local.",
    dismissNotice: "Fermer",
    showFrench: "Afficher en français",
    showEnglish: "Afficher en anglais",
    french: "FR",
    english: "EN",
    documentTitle: "Stockroom — Gestion du stock",
    description: "Une application simple de gestion de stock, utilisable hors ligne."
  }
} as const;

type TranslationKey = keyof typeof translations.en;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The app root element is missing.");
const appRoot: HTMLDivElement = app;

const scanner = new BarcodeScanner();
const API_URL_KEY = "stockroom-api-url";
const LANGUAGE_KEY = "stockroom-language";
const savedLanguage = localStorage.getItem(LANGUAGE_KEY);
let articles: Article[] = [];
let pendingCommands: StockCommand[] = [];
let screen: Screen = "stock";
let search = "";
let scanSearch = "";
let selectedBarcode = "";
let creatingArticle = false;
let generatedBarcode = false;
let generatedBarcodeSvg = "";
let creationDraft = { name: "", quantity: "0" };
let editingArticle = false;
let articleDraft: { name: string; barcode: string } | undefined;
let notice = "";
let syncing = false;
let syncRequested = false;
let installPrompt: BeforeInstallPromptEvent | undefined;
let endpoint = localStorage.getItem(API_URL_KEY) ?? "";
let language: Language =
  savedLanguage === "en" || savedLanguage === "fr"
    ? savedLanguage
    : navigator.language.toLowerCase().startsWith("fr")
      ? "fr"
      : "en";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[character];
  });
}

function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
  return translations[language][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? `{${name}}`)
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US").format(value);
}

function statusLabel(): string {
  if (!navigator.onLine) return t("offline");
  if (syncing) return t("syncing");
  if (!endpoint) return t("localOnly");
  return t("online");
}

function renderArticle(article: Article): string {
  const low = article.quantity <= 5;
  return `
    <article class="article-card">
      <div class="article-symbol" aria-hidden="true">${escapeHtml(article.name.slice(0, 1).toUpperCase())}</div>
      <div class="article-info">
        <h3>${escapeHtml(article.name)}</h3>
        <p>${escapeHtml(article.barcode)}</p>
      </div>
      <div class="article-stock ${low ? "article-stock-low" : ""}">
        <strong>${formatNumber(article.quantity)}</strong>
        <span>${t("inStock")}</span>
      </div>
      <button class="article-edit-button" type="button" data-action="edit-stock" data-barcode="${escapeHtml(article.barcode)}" aria-label="${escapeHtml(t("adjustArticleStock", { name: article.name }))}" title="${escapeHtml(t("adjustArticleStock", { name: article.name }))}">
        <span aria-hidden="true">±</span><span>${t("editStock")}</span>
      </button>
    </article>
  `;
}

function renderStockScreen(): string {
  const matched = articles
    .filter((article) => `${article.name} ${article.barcode}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalUnits = articles.reduce((sum, article) => sum + article.quantity, 0);
  const articleList = matched.length
    ? matched.map(renderArticle).join("")
    : `<div class="empty-state">
        <div class="empty-icon" aria-hidden="true">⌕</div>
        <h3>${articles.length ? t("noMatches") : t("emptyStock")}</h3>
        <p>${articles.length ? t("tryDifferentSearch") : t("scanFirstBarcode")}</p>
      </div>`;

  return `
    <section class="screen" aria-labelledby="stock-heading">
      <div class="screen-heading">
        <div>
          <p class="eyebrow">${t("yourStorage")}</p>
          <h1 id="stock-heading">${t("stockOverview")}</h1>
        </div>
        <button class="icon-button" type="button" data-action="settings" aria-label="${t("connectionSettings")}">⚙</button>
      </div>
      <div class="overview-card">
        <div>
          <span class="overview-label">${t("totalUnits")}</span>
          <strong>${formatNumber(totalUnits)}</strong>
        </div>
        <div class="overview-divider"></div>
        <div>
          <span class="overview-label">${t("articles")}</span>
          <strong>${formatNumber(articles.length)}</strong>
        </div>
        <div class="overview-mark" aria-hidden="true">↗</div>
      </div>
      <div class="section-title-row">
        <h2>${t("allArticles")} <span class="count-pill">${articles.length}</span></h2>
        <button class="text-button" type="button" data-action="sync" ${syncing || !endpoint || !navigator.onLine ? "disabled" : ""}>
          ${syncing ? t("syncingButton") : pendingCommands.length ? t("syncCount", { count: pendingCommands.length }) : t("sync")}
        </button>
      </div>
      <label class="search-box">
        <span aria-hidden="true">⌕</span>
        <input type="search" name="search" value="${escapeHtml(search)}" placeholder="${t("searchPlaceholder")}" autocomplete="off" />
        <kbd>/</kbd>
      </label>
      <div class="article-list">${articleList}</div>
      ${!endpoint ? `<p class="local-note">${t("localNote")}</p>` : ""}
    </section>
  `;
}

function renderSelection(): string {
  const article = articles.find((item) => item.barcode === selectedBarcode);
  if (!selectedBarcode && !creatingArticle) return "";
  if (!article) {
    return `
      <form class="entry-card" data-form="create">
        <div class="entry-heading">
          <div class="entry-icon">＋</div>
          <div><p class="eyebrow">${t("newArticle")}</p><h2>${creatingArticle ? t("createHandmade") : t("barcodeUnknown")}</h2></div>
        </div>
        <div class="generated-code-block">
          <p class="barcode-display">${generatedBarcode ? t("internalBarcode") : t("barcode")} <strong>${escapeHtml(selectedBarcode || t("barcodeNotGenerated"))}</strong></p>
          <p class="generated-code-hint">${t("internalBarcodeInfo")}</p>
          <button class="secondary-button generate-code-button" type="button" data-action="generate-barcode">${t("generateBarcode")}</button>
          ${generatedBarcode ? `<div class="print-label"><strong>${escapeHtml(creationDraft.name || t("createHandmade"))}</strong>${generatedBarcodeSvg}<small>${escapeHtml(selectedBarcode)}</small></div><button class="secondary-button print-label-button" type="button" data-action="print-label">${t("printLabel")}</button>` : ""}
        </div>
        <label class="field-label">${t("articleName")}
          <input name="name" required maxlength="120" value="${escapeHtml(creationDraft.name)}" placeholder="${t("newArticlePlaceholder")}" />
        </label>
        <label class="field-label">${t("startingQuantity")}
          <input name="quantity" type="number" min="0" step="1" value="${escapeHtml(creationDraft.quantity)}" required inputmode="numeric" />
        </label>
        <button class="primary-button" type="submit">${t("createArticle")}</button>
        <button class="secondary-button" type="button" data-action="cancel-selection">${t("cancel")}</button>
      </form>
    `;
  }
  if (editingArticle) {
    return `
      <form class="entry-card" data-form="edit-article">
        <div class="entry-heading">
          <div class="entry-icon">✎</div>
          <div><p class="eyebrow">${t("articleFound")}</p><h2>${escapeHtml(article.name)}</h2></div>
        </div>
        <label class="field-label">${t("articleName")}
          <input name="name" required maxlength="120" value="${escapeHtml(articleDraft?.name ?? article.name)}" />
        </label>
        <label class="field-label">${t("barcode")}
          <input name="barcode" required maxlength="160" value="${escapeHtml(articleDraft?.barcode ?? article.barcode)}" />
        </label>
        <button class="primary-button" type="submit">${t("saveArticleChanges")}</button>
        <button class="secondary-button" type="button" data-action="cancel-article-edit">${t("cancel")}</button>
        <button class="danger-button" type="button" data-action="delete-article" data-barcode="${escapeHtml(article.barcode)}">${t("deleteArticle")}</button>
      </form>
    `;
  }
  return `
    <form class="entry-card" data-form="movement">
      <div class="entry-heading">
        <div class="entry-icon">▦</div>
        <div><p class="eyebrow">${t("articleFound")}</p><h2>${escapeHtml(article.name)}</h2></div>
        <button class="detail-edit-button" type="button" data-action="edit-article" aria-label="${escapeHtml(t("editArticle"))}">✎ ${t("editArticle")}</button>
      </div>
      <p class="barcode-display">${t("barcode")} <strong>${escapeHtml(article.barcode)}</strong></p>
      <div class="current-stock"><span>${t("currentStock")}</span><strong>${formatNumber(article.quantity)} <small>${t("units")}</small></strong></div>
      <div class="movement-choice" role="group" aria-label="${t("movementType")}">
        <label class="choice-card choice-add">
          <input type="radio" name="movementType" value="add" checked />
          <span class="choice-check"></span><span class="choice-symbol">＋</span>
          <span><strong>${t("addStock")}</strong><small>${t("increaseQuantity")}</small></span>
        </label>
        <label class="choice-card choice-remove">
          <input type="radio" name="movementType" value="remove" />
          <span class="choice-check"></span><span class="choice-symbol">−</span>
          <span><strong>${t("removeStock")}</strong><small>${t("decreaseQuantity")}</small></span>
        </label>
      </div>
      <label class="field-label">${t("quantity")}
        <input name="quantity" type="number" min="1" step="1" value="1" required inputmode="numeric" />
      </label>
      <button class="primary-button" type="submit">${t("confirmMovement")} <span aria-hidden="true">→</span></button>
      <button class="secondary-button" type="button" data-action="cancel-selection">${t("scanAnother")}</button>
      <button class="danger-button" type="button" data-action="delete-article" data-barcode="${escapeHtml(article.barcode)}">${t("deleteArticle")}</button>
    </form>
  `;
}

function renderScanScreen(): string {
  const matchingArticles = articles
    .filter((article) =>
      `${article.name} ${article.barcode}`.toLocaleLowerCase(language === "fr" ? "fr-FR" : "en-US")
        .includes(scanSearch.trim().toLocaleLowerCase(language === "fr" ? "fr-FR" : "en-US"))
    )
    .sort((a, b) => a.name.localeCompare(b.name, language === "fr" ? "fr" : "en"));
  const searchResults = scanSearch.trim()
    ? matchingArticles.length
      ? `<div class="scan-results" role="list">
          ${matchingArticles.map((article) => `
            <button class="scan-result" type="button" role="listitem" data-action="select-article" data-barcode="${escapeHtml(article.barcode)}" aria-label="${t("selectArticle")}: ${escapeHtml(article.name)}">
              <span class="scan-result-icon" aria-hidden="true">${escapeHtml(article.name.slice(0, 1).toLocaleUpperCase(language === "fr" ? "fr-FR" : "en-US"))}</span>
              <span class="scan-result-info"><strong>${escapeHtml(article.name)}</strong><small>${escapeHtml(article.barcode)}</small></span>
              <span class="scan-result-quantity">${formatNumber(article.quantity)} ${t("units")}</span>
            </button>
          `).join("")}
        </div>`
      : `<p class="scan-search-empty">${t("noArticlesFound")}</p>`
    : "";

  return `
    <section class="screen" aria-labelledby="scan-heading">
      <div class="screen-heading">
        <div>
          <p class="eyebrow">${t("stockMovement")}</p>
          <h1 id="scan-heading">${t("scanMove")}</h1>
        </div>
        <span class="scan-step">01 <i></i> 02</span>
      </div>
      ${!selectedBarcode && !creatingArticle ? `
        <label class="scan-search-box">
          <span aria-hidden="true">⌕</span>
          <span class="scan-search-label">${t("productSearch")}</span>
          <input type="search" name="scanSearch" value="${escapeHtml(scanSearch)}" placeholder="${t("productSearchPlaceholder")}" autocomplete="off" />
        </label>
        ${searchResults}
        ${scanSearch.trim() ? "" : `
        <div class="scanner-card">
          <div class="camera-frame">
            <video id="scanner-video" muted playsinline></video>
            <div class="camera-overlay" aria-hidden="true"><span></span></div>
            <button class="flash-button" type="button" data-action="toggle-flash" aria-pressed="false" hidden>⚡ ${t("flashOff")}</button>
            <div class="camera-caption"><span class="live-dot"></span> ${t("pointBarcode")}</div>
          </div>
          <p class="scanner-hint">${t("scanHint")}</p>
          <div class="or-divider"><span></span>${t("orEnterManually")}<span></span></div>
          <form class="manual-form" data-form="lookup">
            <label class="sr-only" for="manual-barcode">${t("enterBarcode")}</label>
            <input id="manual-barcode" name="barcode" maxlength="160" placeholder="${t("barcodePlaceholder")}" autocomplete="off" required />
            <button class="primary-button" type="submit">${t("findArticle")}</button>
          </form>
          <button class="secondary-button handmade-button" type="button" data-action="create-handmade">${t("createHandmade")}</button>
        </div>
        `}
      ` : renderSelection()}
      <div class="scan-tip"><span aria-hidden="true">✳</span><p><strong>${t("worksOffline")}</strong><br />${t("offlineQueueHint")}</p></div>
    </section>
  `;
}

function renderSettings(): string {
  return `
    <div class="dialog-backdrop" data-action="close-settings">
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
        <button class="dialog-close" type="button" data-action="close-settings" aria-label="${t("close")}">×</button>
        <p class="eyebrow">${t("cloudSync")}</p>
        <h2 id="settings-heading">${t("connectSheet")}</h2>
        <p class="dialog-copy">${t("settingsDescription")}</p>
        <form data-form="settings">
          <label class="field-label">${t("appsScriptUrl")}
            <input name="endpoint" type="url" value="${escapeHtml(endpoint)}" placeholder="https://script.google.com/macros/s/…/exec" required />
          </label>
          <button class="primary-button" type="submit">${t("saveConnection")}</button>
        </form>
        <div class="security-note"><strong>${t("accessMatters")}</strong> ${t("securityDescription")}</div>
        ${endpoint ? `<button class="disconnect-button" type="button" data-action="disconnect">${t("disconnect")}</button>` : ""}
      </section>
    </div>
  `;
}

function render(): void {
  document.documentElement.lang = language;
  document.title = t("documentTitle");
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", t("description"));
  const focusedSearchName =
    document.activeElement instanceof HTMLInputElement &&
    (document.activeElement.name === "search" || document.activeElement.name === "scanSearch")
      ? document.activeElement.name
      : "";
  const searchCursor =
    focusedSearchName && document.activeElement instanceof HTMLInputElement
      ? document.activeElement.selectionStart
      : null;
  const current = screen === "stock" ? renderStockScreen() : renderScanScreen();
  appRoot.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" data-action="stock" aria-label="${t("stockroomHome")}">
          <span class="brand-mark" aria-hidden="true">S</span><span>stockroom<span class="brand-period">.</span></span>
        </a>
        <div class="topbar-actions">
          <button class="language-toggle" type="button" data-action="language" aria-label="${language === "en" ? t("showFrench") : t("showEnglish")}">${language === "en" ? t("french") : t("english")}</button>
          <div class="sync-status ${navigator.onLine ? "is-online" : "is-offline"}">
            <span class="status-dot"></span><span>${statusLabel()}</span>
          </div>
        </div>
      </header>
      ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}<button type="button" data-action="dismiss-notice" aria-label="${t("dismissNotice")}">×</button></div>` : ""}
      <main>${current}</main>
      <nav class="bottom-nav" aria-label="${t("mainNavigation")}">
        <button class="nav-item ${screen === "stock" ? "active" : ""}" type="button" data-action="stock">
          <span class="nav-icon" aria-hidden="true">▤</span><span>${t("stockNav")}</span>
        </button>
        <button class="nav-item ${screen === "scan" ? "active" : ""}" type="button" data-action="scan">
          <span class="nav-icon nav-scan-icon" aria-hidden="true">⌗</span><span>${t("scanNav")}</span>
        </button>
      </nav>
      ${installPrompt ? `<button class="install-button" type="button" data-action="install">${t("installApp")}</button>` : ""}
      ${document.querySelector(".settings-dialog") ? renderSettings() : ""}
    </div>
  `;
  const searchInput = focusedSearchName
    ? appRoot.querySelector<HTMLInputElement>(`input[name="${focusedSearchName}"]`)
    : null;
  if (searchInput) {
    searchInput.focus();
    const cursor = searchCursor ?? searchInput.value.length;
    searchInput.setSelectionRange(cursor, cursor);
  }
}

function selectedApi(): StockApi {
  if (!endpoint) throw new Error(t("connectFirst"));
  return new StockApi(endpoint);
}

async function refreshLocalData(): Promise<void> {
  [articles, pendingCommands] = await Promise.all([getArticles(), getQueue()]);
}

async function synchronize(): Promise<void> {
  if (!endpoint || !navigator.onLine) return;
  if (syncing) {
    syncRequested = true;
    return;
  }
  syncing = true;
  syncRequested = false;
  notice = "";
  render();
  try {
    const api = selectedApi();
    const queue = await getQueue();
    for (const command of queue) {
      await api.send(command);
      await removeCommand(command.id);
    }
    const replaced = await replaceArticlesIfQueueEmpty(await api.getStock());
    if (!replaced) syncRequested = true;
    await refreshLocalData();
    notice = t("stockUpToDate");
  } catch (error) {
    notice =
      error instanceof Error
        ? t("syncPaused", { error: error.message })
        : t("syncFailed");
    await refreshLocalData();
  } finally {
    syncing = false;
    render();
    if (syncRequested) void synchronize();
  }
}

function selectBarcode(barcode: string): void {
  selectedBarcode = barcode.trim();
  if (!selectedBarcode) return;
  if (selectedBarcode.length > 160) {
    selectedBarcode = "";
    notice = t("barcodeTooLong");
    render();
    return;
  }
  creatingArticle = false;
  generatedBarcode = false;
  creationDraft = { name: "", quantity: "0" };
  editingArticle = false;
  scanner.stop();
  notice = "";
  render();
}

function quantityInput(form: HTMLFormElement): number {
  const value = Number(new FormData(form).get("quantity"));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(t("wholeNumber"));
  return value;
}

async function createArticle(form: HTMLFormElement): Promise<void> {
  const fields = new FormData(form);
  const name = String(fields.get("name") ?? "").trim();
  const quantity = quantityInput(form);
  if (!name) throw new Error(t("articleNameRequired"));
  if (quantity < 0) throw new Error(t("startingQuantityNegative"));
  if (!selectedBarcode) throw new Error(t("invalidBarcode"));
  const article: Article = {
    barcode: selectedBarcode,
    name,
    quantity,
    updatedAt: new Date().toISOString()
  };
  const command: StockCommand = {
    id: crypto.randomUUID(),
    kind: "create",
    barcode: article.barcode,
    name,
    quantity,
    createdAt: article.updatedAt
  };
  await commitNewArticle(article, command);
  await refreshLocalData();
  selectedBarcode = "";
  creatingArticle = false;
  generatedBarcode = false;
  creationDraft = { name: "", quantity: "0" };
  screen = "stock";
  notice = t("articleAdded", { name });
  render();
  void synchronize();
}

async function recordMovement(form: HTMLFormElement): Promise<void> {
  const article = articles.find((item) => item.barcode === selectedBarcode);
  if (!article) throw new Error(t("articleMissing"));
  const fields = new FormData(form);
  const quantity = quantityInput(form);
  const movementType = fields.get("movementType");
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(t("minimumQuantity"));
  if (movementType !== "add" && movementType !== "remove") throw new Error(t("chooseMovement"));
  if (movementType === "remove" && quantity > article.quantity) {
    throw new Error(t("availableUnits", { count: formatNumber(article.quantity) }));
  }
  const nextQuantity = article.quantity + (movementType === "add" ? quantity : -quantity);
  if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) {
    throw new Error(t("quantityRange"));
  }
  const updated: Article = {
    ...article,
    quantity: nextQuantity,
    updatedAt: new Date().toISOString()
  };
  const command: StockCommand = {
    id: crypto.randomUUID(),
    kind: "movement",
    barcode: article.barcode,
    movementType,
    quantity,
    createdAt: updated.updatedAt
  };
  await commitMovement(updated, command);
  await refreshLocalData();
  selectedBarcode = "";
  screen = "stock";
  const quantityText = formatNumber(quantity);
  const movementNotice =
    movementType === "add"
      ? quantity === 1 ? "addedOne" : "addedMany"
      : quantity === 1 ? "removedOne" : "removedMany";
  notice = t(movementNotice, { count: quantityText, name: article.name });
  render();
  void synchronize();
}

async function updateArticle(form: HTMLFormElement): Promise<void> {
  const original = articles.find((item) => item.barcode === selectedBarcode);
  if (!original) throw new Error(t("articleMissing"));
  const fields = new FormData(form);
  const name = String(fields.get("name") ?? "").trim();
  const barcode = String(fields.get("barcode") ?? "").trim();
  if (!name) throw new Error(t("articleNameRequired"));
  if (!barcode) throw new Error(t("invalidBarcode"));
  if (barcode.length > 160) throw new Error(t("barcodeTooLong"));
  const duplicate = articles.find(
    (item) => item.barcode === barcode && item.barcode !== original.barcode
  );
  if (duplicate) throw new Error(t("duplicateBarcode"));
  const updated: Article = {
    ...original,
    barcode,
    name,
    updatedAt: new Date().toISOString()
  };
  const command: StockCommand = {
    id: crypto.randomUUID(),
    kind: "update",
    previousBarcode: original.barcode,
    barcode,
    name,
    createdAt: updated.updatedAt
  };
  try {
    await commitArticleUpdate(original.barcode, updated, command);
  } catch (error) {
    if (error instanceof Error && error.message === "An article with this barcode already exists.") {
      throw new Error(t("duplicateBarcode"));
    }
    throw error;
  }
  await refreshLocalData();
  selectedBarcode = "";
  editingArticle = false;
  articleDraft = undefined;
  screen = "stock";
  notice = t("articleUpdated", { name });
  render();
  void synchronize();
}

async function deleteArticle(barcode: string): Promise<void> {
  const article = articles.find((item) => item.barcode === barcode);
  if (!article) throw new Error(t("articleMissing"));
  if (!window.confirm(t("deleteArticleConfirm", { name: article.name }))) return;
  const command: StockCommand = {
    id: crypto.randomUUID(),
    kind: "delete",
    barcode: article.barcode,
    createdAt: new Date().toISOString()
  };
  await commitArticleDelete(article.barcode, command);
  await refreshLocalData();
  selectedBarcode = "";
  editingArticle = false;
  articleDraft = undefined;
  screen = "stock";
  notice = t("articleDeleted", { name: article.name });
  render();
  void synchronize();
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  try {
    const kind = form.dataset.form;
    if (kind === "lookup") {
      const barcode = String(new FormData(form).get("barcode") ?? "").trim();
      if (barcode) selectBarcode(barcode);
    } else if (kind === "create") {
      creationDraft = {
        name: String(new FormData(form).get("name") ?? ""),
        quantity: String(new FormData(form).get("quantity") ?? "0")
      };
      await createArticle(form);
    } else if (kind === "movement") {
      await recordMovement(form);
    } else if (kind === "edit-article") {
      await updateArticle(form);
    } else if (kind === "settings") {
      const input = form.querySelector<HTMLInputElement>('input[name="endpoint"]');
      const value = input?.value.trim() ?? "";
      if (!value) throw new Error(t("enterDeploymentUrl"));
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com") {
        throw new Error(t("httpsDeploymentUrl"));
      }
      endpoint = value;
      localStorage.setItem(API_URL_KEY, endpoint);
      notice = t("connectionSaved");
      render();
      void synchronize();
    }
  } catch (error) {
    notice = error instanceof Error ? error.message : t("saveFailed");
    render();
  }
}

function updateFlashButton(): void {
  const button = appRoot.querySelector<HTMLButtonElement>('[data-action="toggle-flash"]');
  if (!button) return;
  button.hidden = !scanner.supportsTorch;
  button.setAttribute("aria-pressed", String(scanner.isTorchEnabled));
  button.textContent = `⚡ ${t(scanner.isTorchEnabled ? "flashOn" : "flashOff")}`;
}

async function handleClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;

  if (action === "toggle-flash") {
    const button = target.closest<HTMLButtonElement>('[data-action="toggle-flash"]');
    if (!button) return;
    button.disabled = true;
    try {
      await scanner.setTorch(!scanner.isTorchEnabled);
      updateFlashButton();
    } catch (error) {
      const hint = appRoot.querySelector<HTMLElement>(".scanner-hint");
      if (hint) {
        const message = error instanceof Error ? error.message : t("cameraUnavailableFallback");
        hint.textContent = t("flashFailed", { error: message });
      }
    } finally {
      button.disabled = false;
    }
  } else if (action === "stock" || action === "scan") {
    scanner.stop();
    screen = action;
    selectedBarcode = "";
    creatingArticle = false;
    generatedBarcode = false;
    creationDraft = { name: "", quantity: "0" };
    editingArticle = false;
    articleDraft = undefined;
    notice = "";
    render();
    if (screen === "scan") void startScanner();
  } else if (action === "sync") {
    await synchronize();
  } else if (action === "settings") {
    renderSettingsDialog();
  } else if (action === "language") {
    scanner.stop();
    language = language === "en" ? "fr" : "en";
    localStorage.setItem(LANGUAGE_KEY, language);
    notice = "";
    render();
    if (screen === "scan" && !selectedBarcode && !scanSearch.trim()) void startScanner();
  } else if (action === "select-article") {
    const barcode = target.closest<HTMLElement>("[data-barcode]")?.dataset.barcode;
    if (barcode) selectBarcode(barcode);
  } else if (action === "edit-article") {
    const article = articles.find((item) => item.barcode === selectedBarcode);
    if (!article) return;
    articleDraft = { name: article.name, barcode: article.barcode };
    editingArticle = true;
    render();
  } else if (action === "cancel-article-edit") {
    editingArticle = false;
    articleDraft = undefined;
    render();
  } else if (action === "delete-article") {
    const barcode = target.closest<HTMLElement>("[data-barcode]")?.dataset.barcode;
    if (barcode) {
      try {
        await deleteArticle(barcode);
      } catch (error) {
        notice = error instanceof Error ? error.message : t("saveFailed");
        render();
      }
    }
  } else if (action === "edit-stock") {
    const barcode = target.closest<HTMLElement>("[data-barcode]")?.dataset.barcode;
    if (barcode) {
      scanner.stop();
      selectedBarcode = barcode;
      creatingArticle = false;
      generatedBarcode = false;
      editingArticle = false;
      articleDraft = undefined;
      screen = "scan";
      notice = "";
      render();
    }
  } else if (action === "close-settings") {
    if (target === appRoot.querySelector(".dialog-backdrop") || target.closest(".dialog-close")) {
      removeSettingsDialog();
    }
  } else if (action === "disconnect") {
    endpoint = "";
    localStorage.removeItem(API_URL_KEY);
    notice = t("connectionRemoved");
    removeSettingsDialog();
    render();
  } else if (action === "cancel-selection") {
    selectedBarcode = "";
    creatingArticle = false;
    generatedBarcode = false;
    creationDraft = { name: "", quantity: "0" };
    editingArticle = false;
    articleDraft = undefined;
    render();
    void startScanner();
  } else if (action === "create-handmade") {
    scanner.stop();
    selectedBarcode = "";
    creatingArticle = true;
    generatedBarcode = false;
    creationDraft = { name: "", quantity: "0" };
    render();
  } else if (action === "generate-barcode") {
    const existing = new Set(articles.map((article) => article.barcode));
    let barcode: string;
    do {
      const random = crypto.getRandomValues(new Uint8Array(8));
      const suffix = Array.from(random, (value) => "0123456789ABCDEFGHJKMNPQRSTVWXYZ"[value & 31]).join("");
      barcode = `SM-${Date.now().toString(36).toUpperCase()}-${suffix}`;
    } while (existing.has(barcode));
    try {
      const { default: JsBarcode } = await import("jsbarcode");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, barcode, {
        format: "CODE128",
        width: 2,
        height: 64,
        displayValue: false,
        margin: 4,
        lineColor: "#15231d",
        background: "#ffffff"
      });
      selectedBarcode = barcode;
      generatedBarcodeSvg = svg.outerHTML;
      generatedBarcode = true;
      render();
    } catch (error) {
      console.error("Could not generate an internal barcode.", error);
      notice = t("barcodeGenerationFailed");
      render();
    }
  } else if (action === "print-label") {
    window.print();
  } else if (action === "dismiss-notice") {
    notice = "";
    render();
  } else if (action === "install" && installPrompt) {
    await installPrompt.prompt();
    installPrompt = undefined;
    render();
  }
}

function renderSettingsDialog(): void {
  const shell = appRoot.querySelector(".app-shell");
  if (!shell) return;
  shell.insertAdjacentHTML("beforeend", renderSettings());
  appRoot.querySelector<HTMLInputElement>('input[name="endpoint"]')?.focus();
}

function removeSettingsDialog(): void {
  appRoot.querySelector(".dialog-backdrop")?.remove();
}

async function startScanner(): Promise<void> {
  const video = appRoot.querySelector<HTMLVideoElement>("#scanner-video");
  if (!video || selectedBarcode) return;
  try {
    await scanner.start(video, selectBarcode);
    updateFlashButton();
  } catch (error) {
    scanner.stop();
    notice =
      error instanceof Error
        ? t("cameraUnavailable", { error: error.message })
        : t("cameraUnavailableFallback");
    render();
  }
}

appRoot.addEventListener("submit", (event) => void handleSubmit(event));
appRoot.addEventListener("click", (event) => void handleClick(event));
appRoot.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "search") {
    search = target.value;
    render();
  } else if (target instanceof HTMLInputElement && target.name === "scanSearch") {
    scanSearch = target.value;
    scanner.stop();
    render();
    if (!scanSearch.trim()) void startScanner();
  } else if (target instanceof HTMLInputElement && target.name === "name" && editingArticle) {
    articleDraft = { name: target.value, barcode: articleDraft?.barcode ?? selectedBarcode };
  } else if (target instanceof HTMLInputElement && target.name === "barcode" && editingArticle) {
    const article = articles.find((item) => item.barcode === selectedBarcode);
    articleDraft = {
      name: articleDraft?.name ?? article?.name ?? "",
      barcode: target.value
    };
  } else if (target instanceof HTMLInputElement && target.name === "name" && !editingArticle) {
    creationDraft.name = target.value;
    const labelName = appRoot.querySelector<HTMLElement>(".print-label > strong");
    if (labelName) labelName.textContent = target.value.trim() || t("createHandmade");
  } else if (target instanceof HTMLInputElement && target.name === "quantity" && !editingArticle) {
    creationDraft.quantity = target.value;
  }
});
window.addEventListener("online", () => {
  render();
  void synchronize();
});
window.addEventListener("offline", render);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event as BeforeInstallPromptEvent;
  render();
});
window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  render();
});
window.addEventListener("keydown", (event) => {
  if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
    event.preventDefault();
    appRoot.querySelector<HTMLInputElement>('input[name="search"]')?.focus();
  }
});

async function start(): Promise<void> {
  try {
    await refreshLocalData();
    render();
    if (endpoint && navigator.onLine) void synchronize();
  } catch (error) {
    notice = error instanceof Error ? error.message : t("localStockLoadFailed");
    render();
  }
}

void start();
