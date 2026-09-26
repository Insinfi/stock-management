import { StockApi } from "./api";
import {
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

const scanner = new BarcodeScanner();
const API_URL_KEY = "stockroom-api-url";
let articles: Article[] = [];
let pendingCommands: StockCommand[] = [];
let screen: Screen = "stock";
let search = "";
let selectedBarcode = "";
let notice = "";
let syncing = false;
let syncRequested = false;
let installPrompt: BeforeInstallPromptEvent | undefined;
let endpoint = localStorage.getItem(API_URL_KEY) ?? "";

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function statusLabel(): string {
  if (!navigator.onLine) return "Offline";
  if (syncing) return "Syncing";
  if (!endpoint) return "Local only";
  return "Online";
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
        <span>in stock</span>
      </div>
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
        <h3>${articles.length ? "No matches found" : "Your stockroom is empty"}</h3>
        <p>${articles.length ? "Try another name or barcode." : "Scan your first barcode to add an article."}</p>
      </div>`;

  return `
    <section class="screen" aria-labelledby="stock-heading">
      <div class="screen-heading">
        <div>
          <p class="eyebrow">YOUR STORAGE</p>
          <h1 id="stock-heading">Stock overview</h1>
        </div>
        <button class="icon-button" type="button" data-action="settings" aria-label="Connection settings">⚙</button>
      </div>
      <div class="overview-card">
        <div>
          <span class="overview-label">Total units on hand</span>
          <strong>${formatNumber(totalUnits)}</strong>
        </div>
        <div class="overview-divider"></div>
        <div>
          <span class="overview-label">Articles</span>
          <strong>${formatNumber(articles.length)}</strong>
        </div>
        <div class="overview-mark" aria-hidden="true">↗</div>
      </div>
      <div class="section-title-row">
        <h2>All articles <span class="count-pill">${articles.length}</span></h2>
        <button class="text-button" type="button" data-action="sync" ${syncing || !endpoint || !navigator.onLine ? "disabled" : ""}>
          ${syncing ? "Syncing…" : pendingCommands.length ? `Sync ${pendingCommands.length}` : "↻ Sync"}
        </button>
      </div>
      <label class="search-box">
        <span aria-hidden="true">⌕</span>
        <input type="search" name="search" value="${escapeHtml(search)}" placeholder="Search name or barcode" autocomplete="off" />
        <kbd>/</kbd>
      </label>
      <div class="article-list">${articleList}</div>
      ${!endpoint ? `<p class="local-note">Your stock is saved on this device. Connect a Google Sheet to sync across devices.</p>` : ""}
    </section>
  `;
}

function renderSelection(): string {
  const article = articles.find((item) => item.barcode === selectedBarcode);
  if (!selectedBarcode) return "";
  if (!article) {
    return `
      <form class="entry-card" data-form="create">
        <div class="entry-heading">
          <div class="entry-icon">＋</div>
          <div><p class="eyebrow">NEW ARTICLE</p><h2>Barcode not recognized</h2></div>
        </div>
        <p class="barcode-display">Barcode <strong>${escapeHtml(selectedBarcode)}</strong></p>
        <label class="field-label">Article name
          <input name="name" required maxlength="120" placeholder="e.g. Storage box, medium" />
        </label>
        <label class="field-label">Starting quantity
          <input name="quantity" type="number" min="0" step="1" value="0" required inputmode="numeric" />
        </label>
        <button class="primary-button" type="submit">Create article</button>
        <button class="secondary-button" type="button" data-action="cancel-selection">Cancel</button>
      </form>
    `;
  }
  return `
    <form class="entry-card" data-form="movement">
      <div class="entry-heading">
        <div class="entry-icon">▦</div>
        <div><p class="eyebrow">ARTICLE FOUND</p><h2>${escapeHtml(article.name)}</h2></div>
      </div>
      <p class="barcode-display">Barcode <strong>${escapeHtml(article.barcode)}</strong></p>
      <div class="current-stock"><span>Current stock</span><strong>${formatNumber(article.quantity)} <small>units</small></strong></div>
      <div class="movement-choice" role="group" aria-label="Movement type">
        <label class="choice-card choice-add">
          <input type="radio" name="movementType" value="add" checked />
          <span class="choice-check"></span><span class="choice-symbol">＋</span>
          <span><strong>Add stock</strong><small>Increase quantity</small></span>
        </label>
        <label class="choice-card choice-remove">
          <input type="radio" name="movementType" value="remove" />
          <span class="choice-check"></span><span class="choice-symbol">−</span>
          <span><strong>Remove stock</strong><small>Decrease quantity</small></span>
        </label>
      </div>
      <label class="field-label">Quantity
        <input name="quantity" type="number" min="1" step="1" value="1" required inputmode="numeric" />
      </label>
      <button class="primary-button" type="submit">Confirm movement <span aria-hidden="true">→</span></button>
      <button class="secondary-button" type="button" data-action="cancel-selection">Scan another article</button>
    </form>
  `;
}

function renderScanScreen(): string {
  return `
    <section class="screen" aria-labelledby="scan-heading">
      <div class="screen-heading">
        <div>
          <p class="eyebrow">STOCK MOVEMENT</p>
          <h1 id="scan-heading">Scan &amp; move</h1>
        </div>
        <span class="scan-step">01 <i></i> 02</span>
      </div>
      ${!selectedBarcode ? `
        <div class="scanner-card">
          <div class="camera-frame">
            <video id="scanner-video" muted playsinline></video>
            <div class="camera-overlay" aria-hidden="true"><span></span></div>
            <div class="camera-caption"><span class="live-dot"></span> Point at a barcode</div>
          </div>
          <p class="scanner-hint">Hold the barcode steady inside the frame. It will scan automatically.</p>
          <div class="or-divider"><span></span>or enter manually<span></span></div>
          <form class="manual-form" data-form="lookup">
            <label class="sr-only" for="manual-barcode">Enter barcode</label>
            <input id="manual-barcode" name="barcode" maxlength="160" placeholder="Type or paste a barcode" autocomplete="off" required />
            <button class="primary-button" type="submit">Find article</button>
          </form>
        </div>
      ` : renderSelection()}
      <div class="scan-tip"><span aria-hidden="true">✳</span><p><strong>Works offline</strong><br />Your changes are saved on this device and queued to sync later.</p></div>
    </section>
  `;
}

function renderSettings(): string {
  return `
    <div class="dialog-backdrop" data-action="close-settings">
      <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-heading">
        <button class="dialog-close" type="button" data-action="close-settings" aria-label="Close">×</button>
        <p class="eyebrow">CLOUD SYNC</p>
        <h2 id="settings-heading">Connect your stock sheet</h2>
        <p class="dialog-copy">Paste the web app URL from your Google Apps Script deployment. You can keep using Stockroom offline until it is ready.</p>
        <form data-form="settings">
          <label class="field-label">Apps Script web app URL
            <input name="endpoint" type="url" value="${escapeHtml(endpoint)}" placeholder="https://script.google.com/macros/s/…/exec" required />
          </label>
          <button class="primary-button" type="submit">Save connection</button>
        </form>
        <div class="security-note"><strong>Access matters.</strong> Restrict the Apps Script deployment to your Google account or organization where possible. Anyone who can open a publicly accessible endpoint could change stock.</div>
        ${endpoint ? `<button class="disconnect-button" type="button" data-action="disconnect">Disconnect this device</button>` : ""}
      </section>
    </div>
  `;
}

function render(): void {
  const searchHasFocus =
    document.activeElement instanceof HTMLInputElement && document.activeElement.name === "search";
  const searchCursor =
    searchHasFocus && document.activeElement instanceof HTMLInputElement
      ? document.activeElement.selectionStart
      : null;
  const current = screen === "stock" ? renderStockScreen() : renderScanScreen();
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" data-action="stock" aria-label="Stockroom home">
          <span class="brand-mark" aria-hidden="true">S</span><span>stockroom<span class="brand-period">.</span></span>
        </a>
        <div class="sync-status ${navigator.onLine ? "is-online" : "is-offline"}">
          <span class="status-dot"></span><span>${statusLabel()}</span>
        </div>
      </header>
      ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}<button type="button" data-action="dismiss-notice" aria-label="Dismiss">×</button></div>` : ""}
      <main>${current}</main>
      <nav class="bottom-nav" aria-label="Main navigation">
        <button class="nav-item ${screen === "stock" ? "active" : ""}" type="button" data-action="stock">
          <span class="nav-icon" aria-hidden="true">▤</span><span>Stock</span>
        </button>
        <button class="nav-item ${screen === "scan" ? "active" : ""}" type="button" data-action="scan">
          <span class="nav-icon nav-scan-icon" aria-hidden="true">⌗</span><span>Scan &amp; move</span>
        </button>
      </nav>
      ${installPrompt ? `<button class="install-button" type="button" data-action="install">＋ Install app</button>` : ""}
      ${document.querySelector(".settings-dialog") ? renderSettings() : ""}
    </div>
  `;
  const searchInput = app.querySelector<HTMLInputElement>('input[name="search"]');
  if (searchInput && searchHasFocus) {
    searchInput.focus();
    const cursor = searchCursor ?? searchInput.value.length;
    searchInput.setSelectionRange(cursor, cursor);
  }
}

function selectedApi(): StockApi {
  if (!endpoint) throw new Error("Connect a Google Sheet first.");
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
    notice = "Stock is up to date.";
  } catch (error) {
    notice = error instanceof Error ? `Sync paused: ${error.message}` : "Sync failed unexpectedly.";
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
    notice = "This barcode is too long to save.";
    render();
    return;
  }
  scanner.stop();
  notice = "";
  render();
}

function quantityInput(form: HTMLFormElement): number {
  const value = Number(new FormData(form).get("quantity"));
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Enter a whole number for the quantity.");
  return value;
}

async function createArticle(form: HTMLFormElement): Promise<void> {
  const fields = new FormData(form);
  const name = String(fields.get("name") ?? "").trim();
  const quantity = quantityInput(form);
  if (!name) throw new Error("Enter an article name.");
  if (quantity < 0) throw new Error("Starting quantity cannot be negative.");
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
  screen = "stock";
  notice = `${name} added to your stock.`;
  render();
  void synchronize();
}

async function recordMovement(form: HTMLFormElement): Promise<void> {
  const article = articles.find((item) => item.barcode === selectedBarcode);
  if (!article) throw new Error("This article is no longer in your local stock.");
  const fields = new FormData(form);
  const quantity = quantityInput(form);
  const movementType = fields.get("movementType");
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Enter a quantity of at least 1.");
  if (movementType !== "add" && movementType !== "remove") throw new Error("Choose whether to add or remove stock.");
  if (movementType === "remove" && quantity > article.quantity) {
    throw new Error(`Only ${article.quantity} units are currently available.`);
  }
  const nextQuantity = article.quantity + (movementType === "add" ? quantity : -quantity);
  if (!Number.isSafeInteger(nextQuantity) || nextQuantity < 0) {
    throw new Error("The resulting stock quantity is outside the supported range.");
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
  notice = `${movementType === "add" ? "Added" : "Removed"} ${quantity} ${quantity === 1 ? "unit" : "units"} ${movementType === "add" ? "to" : "from"} ${article.name}.`;
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
      await createArticle(form);
    } else if (kind === "movement") {
      await recordMovement(form);
    } else if (kind === "settings") {
      const input = form.querySelector<HTMLInputElement>('input[name="endpoint"]');
      const value = input?.value.trim() ?? "";
      if (!value) throw new Error("Enter a valid Apps Script deployment URL.");
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" || parsed.hostname !== "script.google.com") {
        throw new Error("Use the HTTPS web app URL from script.google.com.");
      }
      endpoint = value;
      localStorage.setItem(API_URL_KEY, endpoint);
      notice = "Connection saved. Syncing your stock…";
      render();
      void synchronize();
    }
  } catch (error) {
    notice = error instanceof Error ? error.message : "Could not save this change.";
    render();
  }
}

async function handleClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
  if (!action) return;

  if (action === "stock" || action === "scan") {
    scanner.stop();
    screen = action;
    selectedBarcode = "";
    notice = "";
    render();
    if (screen === "scan") void startScanner();
  } else if (action === "sync") {
    await synchronize();
  } else if (action === "settings") {
    renderSettingsDialog();
  } else if (action === "close-settings") {
    if (target === app.querySelector(".dialog-backdrop") || target.closest(".dialog-close")) {
      removeSettingsDialog();
    }
  } else if (action === "disconnect") {
    endpoint = "";
    localStorage.removeItem(API_URL_KEY);
    notice = "Sheet connection removed from this device. Local stock is unchanged.";
    removeSettingsDialog();
    render();
  } else if (action === "cancel-selection") {
    selectedBarcode = "";
    render();
    void startScanner();
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
  const shell = app.querySelector(".app-shell");
  if (!shell) return;
  shell.insertAdjacentHTML("beforeend", renderSettings());
  app.querySelector<HTMLInputElement>('input[name="endpoint"]')?.focus();
}

function removeSettingsDialog(): void {
  app.querySelector(".dialog-backdrop")?.remove();
}

async function startScanner(): Promise<void> {
  const video = app.querySelector<HTMLVideoElement>("#scanner-video");
  if (!video || selectedBarcode) return;
  try {
    await scanner.start(video, selectBarcode);
  } catch (error) {
    scanner.stop();
    notice =
      error instanceof Error
        ? `Camera unavailable: ${error.message}. Enter the barcode manually instead.`
        : "Camera unavailable. Enter the barcode manually instead.";
    render();
  }
}

app.addEventListener("submit", (event) => void handleSubmit(event));
app.addEventListener("click", (event) => void handleClick(event));
app.addEventListener("input", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.name === "search") {
    search = target.value;
    render();
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
    app.querySelector<HTMLInputElement>('input[name="search"]')?.focus();
  }
});

async function start(): Promise<void> {
  try {
    await refreshLocalData();
    render();
    if (endpoint && navigator.onLine) void synchronize();
  } catch (error) {
    notice = error instanceof Error ? error.message : "Could not load local stock.";
    render();
  }
}

void start();
