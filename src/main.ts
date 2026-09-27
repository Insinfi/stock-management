import { translate, type Language, type TranslationKey } from "./i18n";
import { renderScanScreen } from "./views/scan/ScanScreen";
import { renderStockScreen } from "./views/stock/StockScreen";
import type { ViewContext } from "./views/view-context";
import { getArticles, getQueue } from "./db";
import { GroupsFeature } from "./features/groups/GroupsFeature";
import { scannerFeature } from "./features/scanner/ScannerFeature";
import { StockFeature } from "./features/stock/StockFeature";
import { SyncFeature } from "./features/sync/SyncFeature";
import type { Article, StockCommand } from "./types";
import "./styles.css";

type Screen = "stock" | "scan";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("The app root element is missing.");
const appRoot: HTMLDivElement = app;

const scanner = scannerFeature;
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
let installPrompt: BeforeInstallPromptEvent | undefined;
let endpoint = localStorage.getItem(API_URL_KEY) ?? "";
let language: Language =
  savedLanguage === "en" || savedLanguage === "fr"
    ? savedLanguage
    : navigator.language.toLowerCase().startsWith("fr")
      ? "fr"
      : "en";

const syncFeature = new SyncFeature({
  getEndpoint: () => endpoint,
  isOnline: () => navigator.onLine,
  setNotice: (value) => { notice = value; },
  t,
  refreshLocalData,
  renderSyncUpdate
});

const groupsFeature = new GroupsFeature({
  getArticles: () => articles,
  setNotice: (value) => { notice = value; },
  t,
  render,
  refreshLocalData,
  synchronize: () => syncFeature.synchronize()
});

const stockFeature = new StockFeature({
  getEndpoint: () => endpoint,
  isOnline: () => navigator.onLine,
  getArticles: () => articles,
  getSelectedBarcode: () => selectedBarcode,
  setSelectedBarcode: (value) => { selectedBarcode = value; },
  setScreen: (value) => { screen = value; },
  setCreatingArticle: (value) => { creatingArticle = value; },
  setGeneratedBarcode: (value) => { generatedBarcode = value; },
  setGeneratedBarcodeSvg: (value) => { generatedBarcodeSvg = value; },
  getCreationDraft: () => creationDraft,
  setCreationDraft: (value) => { creationDraft = value; },
  getEditingArticle: () => editingArticle,
  setEditingArticle: (value) => { editingArticle = value; },
  getArticleDraft: () => articleDraft,
  setArticleDraft: (value) => { articleDraft = value; },
  setNotice: (value) => { notice = value; },
  t,
  formatNumber,
  render,
  refreshLocalData,
  synchronize: () => syncFeature.synchronize(),
  stopScanner: () => scannerFeature.stop(),
  startScanner,
  root: appRoot
});

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
  if (syncFeature.isSyncing) return t("syncing");
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
          {
            articles,
            search,
            pendingCommands,
            syncing: syncFeature.isSyncing,
            endpoint,
            online: navigator.onLine,
            groupState: groupsFeature.viewState
          },
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
  void stockFeature.loadPhotos();
  const searchInput = focusedSearchName
    ? appRoot.querySelector<HTMLInputElement>(`input[name="${focusedSearchName}"]`)
    : null;
  if (searchInput) {
    searchInput.focus();
    const cursor = searchCursor ?? searchInput.value.length;
    searchInput.setSelectionRange(cursor, cursor);
  }
}

async function refreshLocalData(): Promise<void> {
  [articles, pendingCommands] = await Promise.all([getArticles(), getQueue()]);
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

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  try {
    const kind = form.dataset.form;
    if (await groupsFeature.handleSubmit(form) || await stockFeature.handleSubmit(form)) {
      return;
    } else if (kind === "lookup") {
      const barcode = String(new FormData(form).get("barcode") ?? "").trim();
      if (barcode) selectBarcode(barcode);
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
      void syncFeature.synchronize();
    }
  } catch (error) {
    notice = error instanceof Error ? error.message : t("saveFailed");
    render();
  }
}

async function handleClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;

  if (await scanner.handleAction(target, appRoot, t)) {
    return;
  } else if (await groupsFeature.handleAction(action, target)) {
    return;
  } else if (await stockFeature.handleAction(action, target)) {
    return;
  } else if (action === "stock" || action === "scan") {
    scanner.stop();
    groupsFeature.reset();
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
    await syncFeature.synchronize();
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
  if (selectedBarcode) return;
  await scanner.start(
    appRoot,
    selectBarcode,
    (error) => {
      notice =
        error instanceof Error
          ? t("cameraUnavailable", { error: error.message })
          : t("cameraUnavailableFallback");
      render();
    },
    t
  );
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
  } else if (target instanceof HTMLInputElement && target.name === "groupName") {
    groupsFeature.updateGroupName(target.value);
  } else if (target instanceof HTMLInputElement) {
    stockFeature.handleInput(target);
  }
});
appRoot.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.hasAttribute("data-article-photo")) {
    void stockFeature.handlePhotoChange(target);
  } else if (target instanceof HTMLInputElement && target.hasAttribute("data-group-member-checkbox")) {
    groupsFeature.toggleMember(target.dataset.barcode ?? "", target.checked);
    render();
  }
});
window.addEventListener("online", () => {
  if (isLiveScannerScreen()) updateSyncStatus();
  else render();
  void syncFeature.synchronize();
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
    if (endpoint && navigator.onLine) void syncFeature.synchronize();
  } catch (error) {
    notice = error instanceof Error ? error.message : t("localStockLoadFailed");
    render();
  }
}

void start();
