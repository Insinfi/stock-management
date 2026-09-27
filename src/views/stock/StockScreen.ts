import type { Article, GroupsFeatureViewState, StockCommand } from "../../types";
import type { ViewContext } from "../view-context";
import { renderGroupDetails } from "./GroupDetails";
import { renderArticleSymbol } from "./ArticleSymbol";

interface StockScreenOptions {
  articles: Article[];
  search: string;
  pendingCommands: StockCommand[];
  syncing: boolean;
  endpoint: string;
  online: boolean;
  groupState: GroupsFeatureViewState;
}

export function renderStockScreen(options: StockScreenOptions, { t, escapeHtml, formatNumber }: ViewContext): string {
  const { articles, search, pendingCommands, syncing, endpoint, online, groupState } = options;
  const groups = new Map<string, Article[]>();
  articles.forEach((article) => {
    if (!article.groupId || !article.groupName) return;
    const group = groups.get(article.groupId) ?? [];
    group.push(article);
    groups.set(article.groupId, group);
  });
  const activeGroup = groupState.activeGroupId
    ? groups.get(groupState.activeGroupId)
    : undefined;
  if (activeGroup && activeGroup.length >= 2) {
    return renderGroupDetails({
      group: activeGroup,
      availableArticles: articles.filter((article) => !article.groupId),
      search,
      state: groupState
    }, { t, escapeHtml, formatNumber });
  }

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const displayedGroups = [...groups.entries()]
    .filter(([, members]) => members.length >= 2)
    .map(([id, members]) => ({
      id,
      members,
      name: members[0].groupName ?? members[0].name,
      quantity: members.reduce((sum, article) => sum + article.quantity, 0)
    }))
    .filter((group) =>
      !normalizedSearch ||
      group.name.toLocaleLowerCase().includes(normalizedSearch) ||
      group.members.some((article) =>
        `${article.name} ${article.barcode}`.toLocaleLowerCase().includes(normalizedSearch)
      )
    );
  const groupedBarcodes = new Set(
    [...groups.values()].filter((members) => members.length >= 2).flatMap((members) => members.map((article) => article.barcode))
  );
  const matched = articles
    .filter((article) =>
      !groupedBarcodes.has(article.barcode) &&
      (!normalizedSearch || `${article.name} ${article.barcode}`.toLocaleLowerCase().includes(normalizedSearch))
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const displayRowCount = matched.length + displayedGroups.length;
  const totalUnits = articles.reduce((sum, article) => sum + article.quantity, 0);
  const articleList = displayRowCount
    ? [
        ...displayedGroups.map((group) => ({
          name: group.name,
          markup: renderGroup(group, { t, escapeHtml, formatNumber })
        })),
        ...matched.map((article) => ({
          name: article.name,
          markup: renderArticle(article, groupState, { t, escapeHtml, formatNumber })
        }))
      ].sort((a, b) => a.name.localeCompare(b.name)).map((row) => row.markup).join("")
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
        <h2>${t("allArticles")} <span class="count-pill">${formatNumber(displayRowCount)}</span></h2>
        <button class="text-button" type="button" data-action="sync" ${syncing || !endpoint || !online ? "disabled" : ""}>
          ${syncing ? t("syncingButton") : pendingCommands.length ? t("syncCount", { count: pendingCommands.length }) : t("sync")}
        </button>
      </div>
      ${groupState.selectingMembers ? `
        <div class="group-selection-toolbar">
          <p>${t("selectedGroupItems", { count: groupState.selectedBarcodes.length })}</p>
          <button class="text-button" type="button" data-action="cancel-group-selection">${t("cancel")}</button>
        </div>
        <form class="group-create-form" data-form="create-group">
          <label class="field-label">${t("groupName")}
            <input name="groupName" required maxlength="120" value="${escapeHtml(groupState.groupNameDraft)}" placeholder="${t("groupNamePlaceholder")}" />
          </label>
          <button class="primary-button" type="submit" ${groupState.selectedBarcodes.length < 2 ? "disabled" : ""}>
            ${t("createGroup")}
          </button>
        </form>
      ` : `<button class="secondary-button group-start-button" type="button" data-action="start-group-selection">${t("groupItems")}</button>`}
      <label class="search-box">
        <span aria-hidden="true">⌕</span>
        <input type="search" name="search" value="${escapeHtml(search)}" placeholder="${t("searchPlaceholder")}" autocomplete="off" />
        <kbd>/</kbd>
      </label>
      <div class="article-list">${articleList}</div>
      ${!endpoint ? `<p class="local-note">${t("localNote")}</p>` : ""}
      <footer class="build-version">${t("buildVersion", { version: __APP_VERSION__ })}</footer>
    </section>
  `;
}

function renderArticle(article: Article, groupState: GroupsFeatureViewState, { t, escapeHtml, formatNumber }: ViewContext): string {
  const low = article.quantity <= 5;
  return `
    <article class="article-card ${groupState.selectingMembers ? "article-card-selecting" : ""}">
      ${groupState.selectingMembers ? `<input class="group-member-checkbox" type="checkbox" data-group-member-checkbox data-barcode="${escapeHtml(article.barcode)}" ${groupState.selectedBarcodes.includes(article.barcode) ? "checked" : ""} aria-label="${escapeHtml(t("selectGroupMember", { name: article.name }))}" />` : ""}
      ${renderArticleSymbol(article, escapeHtml)}
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

function renderGroup(
  group: { id: string; members: Article[]; name: string; quantity: number },
  { t, escapeHtml, formatNumber }: ViewContext
): string {
  const low = group.quantity <= 5;
  return `
    <article class="article-card group-card">
      <div class="article-symbol group-symbol" aria-hidden="true">▧</div>
      <div class="article-info">
        <h3>${escapeHtml(group.name)}</h3>
        <p>${t("groupItemCount", { count: group.members.length })}</p>
      </div>
      <div class="article-stock ${low ? "article-stock-low" : ""}">
        <strong>${formatNumber(group.quantity)}</strong>
        <span>${t("totalGroupQuantityShort")}</span>
      </div>
      <button class="article-edit-button group-details-button" type="button" data-action="open-group" data-group-id="${escapeHtml(group.id)}">
        ${t("viewGroup")}
      </button>
    </article>
  `;
}
