import type { Article } from "../../types";
import type { Language } from "../../i18n";
import { scannerFeature } from "../../features/scanner/ScannerFeature";
import { renderArticleSelection } from "./ArticleSelection";
import type { ViewContext } from "../view-context";

interface ScanScreenOptions {
  articles: Article[];
  language: Language;
  scanSearch: string;
  selectedBarcode: string;
  creatingArticle: boolean;
  generatedBarcode: boolean;
  generatedBarcodeSvg: string;
  creationDraft: { name: string; quantity: string };
  editingArticle: boolean;
  articleDraft?: { name: string; barcode: string };
}

export function renderScanScreen(options: ScanScreenOptions, context: ViewContext): string {
  const { articles, language, scanSearch, selectedBarcode, creatingArticle } = options;
  const { t, escapeHtml, formatNumber } = context;
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

  const selection = renderArticleSelection(
    {
      article: articles.find((article) => article.barcode === selectedBarcode),
      selectedBarcode,
      creatingArticle,
      generatedBarcode: options.generatedBarcode,
      generatedBarcodeSvg: options.generatedBarcodeSvg,
      creationDraft: options.creationDraft,
      editingArticle: options.editingArticle,
      articleDraft: options.articleDraft
    },
    context
  );

  return `
    <section class="screen" aria-labelledby="scan-heading">
      <div class="screen-heading">
        <div>
          <p class="eyebrow">${t("stockMovement")}</p>
          <h1 id="scan-heading">${t("scanMove")}</h1>
        </div>
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
            ${scannerFeature.renderTorchButton(t)}
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
      ` : selection}
      <div class="scan-tip"><span aria-hidden="true">✳</span><p><strong>${t("worksOffline")}</strong><br />${t("offlineQueueHint")}</p></div>
    </section>
  `;
}
