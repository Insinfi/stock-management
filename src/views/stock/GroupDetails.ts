import type { Article, GroupsFeatureViewState } from "../../types";
import type { ViewContext } from "../view-context";

interface GroupDetailsOptions {
  group: Article[];
  availableArticles: Article[];
  search: string;
  state: GroupsFeatureViewState;
}

export function renderGroupDetails(
  options: GroupDetailsOptions,
  { t, escapeHtml, formatNumber }: ViewContext
): string {
  const { group, availableArticles, search, state } = options;
  const first = group[0];
  if (!first) return "";
  const total = group.reduce((sum, article) => sum + article.quantity, 0);
  const groupName = first.groupName ?? first.name;

  if (state.selectingMembers && state.targetGroupId === first.groupId) {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    const choices = availableArticles
      .filter((article) =>
        `${article.name} ${article.barcode}`.toLocaleLowerCase().includes(normalizedSearch)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
    return `
      <section class="screen" aria-labelledby="group-heading">
        <div class="screen-heading">
          <div><p class="eyebrow">${t("articleGroup")}</p><h1 id="group-heading">${escapeHtml(groupName)}</h1></div>
          <button class="text-button" type="button" data-action="cancel-group-selection">${t("cancel")}</button>
        </div>
        <p class="group-help">${t("chooseGroupMembers")}</p>
        <label class="search-box">
          <span aria-hidden="true">⌕</span>
          <input type="search" name="search" value="${escapeHtml(search)}" placeholder="${t("searchPlaceholder")}" autocomplete="off" />
          <kbd>/</kbd>
        </label>
        <div class="article-list">
          ${choices.length ? choices.map((article) => renderChoice(article, state.selectedBarcodes, { t, escapeHtml, formatNumber })).join("") : `<p class="group-help">${t("noUngroupedItems")}</p>`}
        </div>
        <button class="primary-button group-submit-button" type="button" data-action="apply-group-members" ${state.selectedBarcodes.length ? "" : "disabled"}>
          ${t("addSelectedToGroup", { count: state.selectedBarcodes.length })}
        </button>
      </section>
    `;
  }

  return `
    <section class="screen" aria-labelledby="group-heading">
      <button class="text-button group-back-button" type="button" data-action="close-group">← ${t("backToStock")}</button>
      <div class="screen-heading group-detail-heading">
        <div><p class="eyebrow">${t("articleGroup")}</p><h1 id="group-heading">${escapeHtml(groupName)}</h1></div>
        <button class="secondary-button" type="button" data-action="add-group-members">${t("addGroupItems")}</button>
      </div>
      <div class="overview-card group-overview">
        <div><span class="overview-label">${t("totalGroupQuantity")}</span><strong>${formatNumber(total)}</strong></div>
        <div class="overview-divider"></div>
        <div><span class="overview-label">${t("groupMembers")}</span><strong>${formatNumber(group.length)}</strong></div>
      </div>
      <div class="section-title-row"><h2>${t("groupMembers")}</h2></div>
      <div class="article-list">
        ${group.map((article) => `
          <article class="article-card group-member-card">
            <div class="article-symbol" aria-hidden="true">${escapeHtml(article.name.slice(0, 1).toUpperCase())}</div>
            <div class="article-info">
              <h3>${escapeHtml(article.name)}</h3>
              <p>${escapeHtml(article.barcode)}</p>
            </div>
            <div class="article-stock ${article.quantity <= 5 ? "article-stock-low" : ""}">
              <strong>${formatNumber(article.quantity)}</strong><span>${t("inStock")}</span>
            </div>
            <button class="article-edit-button" type="button" data-action="edit-stock" data-barcode="${escapeHtml(article.barcode)}" aria-label="${escapeHtml(t("adjustArticleStock", { name: article.name }))}" title="${escapeHtml(t("adjustArticleStock", { name: article.name }))}">
              <span aria-hidden="true">±</span><span>${t("editStock")}</span>
            </button>
            <button class="group-remove-button" type="button" data-action="remove-group-member" data-barcode="${escapeHtml(article.barcode)}" data-group-id="${escapeHtml(first.groupId ?? "")}" aria-label="${escapeHtml(t("removeFromGroup", { name: article.name }))}" title="${escapeHtml(t("removeFromGroup", { name: article.name }))}">×</button>
          </article>
        `).join("")}
      </div>
      <p class="group-help">${t("groupScanHint")}</p>
    </section>
  `;
}

function renderChoice(
  article: Article,
  selectedBarcodes: string[],
  { t, escapeHtml, formatNumber }: ViewContext
): string {
  return `
    <label class="article-card group-choice-card">
      <input type="checkbox" data-group-member-checkbox data-barcode="${escapeHtml(article.barcode)}" ${selectedBarcodes.includes(article.barcode) ? "checked" : ""} />
      <span class="article-symbol" aria-hidden="true">${escapeHtml(article.name.slice(0, 1).toUpperCase())}</span>
      <span class="article-info"><strong>${escapeHtml(article.name)}</strong><small>${escapeHtml(article.barcode)}</small></span>
      <span class="article-stock"><strong>${formatNumber(article.quantity)}</strong><span>${t("inStock")}</span></span>
    </label>
  `;
}
