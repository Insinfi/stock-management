import type { Article, StockCommand } from "../../types";
import type { ViewContext } from "../view-context";

interface StockScreenOptions {
  articles: Article[];
  search: string;
  pendingCommands: StockCommand[];
  syncing: boolean;
  endpoint: string;
  online: boolean;
}

export function renderStockScreen(options: StockScreenOptions, { t, escapeHtml, formatNumber }: ViewContext): string {
  const { articles, search, pendingCommands, syncing, endpoint, online } = options;
  const matched = articles
    .filter((article) => `${article.name} ${article.barcode}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const totalUnits = articles.reduce((sum, article) => sum + article.quantity, 0);
  const articleList = matched.length
    ? matched.map((article) => renderArticle(article, { t, escapeHtml, formatNumber })).join("")
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
        <button class="text-button" type="button" data-action="sync" ${syncing || !endpoint || !online ? "disabled" : ""}>
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

function renderArticle(article: Article, { t, escapeHtml, formatNumber }: ViewContext): string {
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
