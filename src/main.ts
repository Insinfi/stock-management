import { StockApi } from "./api";
import { translate, type Language, type TranslationKey } from "./i18n";
import { renderScanScreen } from "./views/scan/ScanScreen";
import { renderStockScreen } from "./views/stock/StockScreen";
import type { ViewContext } from "./views/view-context";
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
  return translate(language, key, values);
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

function isLiveScannerScreen(): boolean {
  return screen === "scan" && !selectedBarcode && !creatingArticle && !scanSearch.trim();
}

function updateNotice(): void {
  const currentNotice = appRoot.querySelector<HTMLElement>(".notice");
  if (!notice) {
    currentNotice?.remove();
    return;
  }

  const markup = `<div class="notice" role="status">${escapeHtml(notice)}<button type="button" data-action="dismiss-notice" aria-label="${t("dismissNotice")}">×</button></div>`;
  if (currentNotice) {
    currentNotice.outerHTML = markup;
  } else {
    appRoot.querySelector("main")?.insertAdjacentHTML("beforebegin", markup);
  }
}

function updateSyncStatus(): void {
  const status = appRoot.querySelector<HTMLElement>(".sync-status");
  if (!status) return;
  status.classList.toggle("is-online", navigator.onLine);
  status.classList.toggle("is-offline", !navigator.onLine);
  status.querySelector("span:last-child")?.replaceChildren(statusLabel());
}

function renderSyncUpdate(): void {
  if (!isLiveScannerScreen()) {
    render();
    return;
  }
  updateSyncStatus();
  updateNotice();
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
  const viewContext: ViewContext = { t, escapeHtml, formatNumber };
  const current =
    screen === "stock"
      ? renderStockScreen(
          { articles, search, pendingCommands, syncing, endpoint, online: navigator.onLine },
          viewContext
        )
      : renderScanScreen(
          {
            articles,
            language,
            scanSearch,
            selectedBarcode,
            creatingArticle,
            generatedBarcode,
            generatedBarcodeSvg,
            creationDraft,
            editingArticle,
            articleDraft
          },
          viewContext
        );
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
  renderSyncUpdate();
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
    renderSyncUpdate();
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
    if (isLiveScannerScreen()) updateNotice();
    else render();
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
  if (isLiveScannerScreen()) updateSyncStatus();
  else render();
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
