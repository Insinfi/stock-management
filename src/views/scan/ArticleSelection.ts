import type { Article } from "../../types";
import type { ViewContext } from "../view-context";

interface ArticleSelectionOptions {
  article?: Article;
  selectedBarcode: string;
  creatingArticle: boolean;
  generatedBarcode: boolean;
  generatedBarcodeSvg: string;
  creationDraft: { name: string; quantity: string };
  editingArticle: boolean;
  articleDraft?: { name: string; barcode: string };
}

export function renderArticleSelection(
  options: ArticleSelectionOptions,
  { t, escapeHtml, formatNumber }: ViewContext
): string {
  const {
    article,
    selectedBarcode,
    creatingArticle,
    generatedBarcode,
    generatedBarcodeSvg,
    creationDraft,
    editingArticle,
    articleDraft
  } = options;

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
        ${renderPhoto(article, { t, escapeHtml }, true)}
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
      ${renderPhoto(article, { t, escapeHtml }, false)}
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

function renderPhoto(
  article: Article,
  { t, escapeHtml }: Pick<ViewContext, "t" | "escapeHtml">,
  canChange: boolean
): string {
  const source = article.photoDataUrl ??
    (article.photoFileId
      ? `https://drive.google.com/uc?export=view&id=${encodeURIComponent(article.photoFileId)}`
      : "");
  return `
    <div class="article-photo-section">
      ${source
        ? `<img class="article-photo" src="${escapeHtml(source)}" alt="${escapeHtml(t("articlePhotoAlt", { name: article.name }))}" loading="lazy" />`
        : `<p class="article-photo-empty">${t("noArticlePhoto")}</p>`}
      ${canChange ? `
        <div class="article-photo-actions">
          <label class="secondary-button photo-picker-button">${t("takePhoto")}
            <input type="file" accept="image/*" capture="environment" data-article-photo data-barcode="${escapeHtml(article.barcode)}" aria-label="${escapeHtml(t("takePhoto"))}" />
          </label>
          <label class="secondary-button photo-picker-button">${t("choosePhoto")}
            <input type="file" accept="image/*" data-article-photo data-barcode="${escapeHtml(article.barcode)}" aria-label="${escapeHtml(t("choosePhoto"))}" />
          </label>
        </div>
        <p class="photo-help">${t("photoStoredInDrive")}</p>
      ` : ""}
    </div>
  `;
}
