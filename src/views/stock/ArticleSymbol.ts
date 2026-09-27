import type { Article } from "../../types";

export function renderArticleSymbol(article: Article, escapeHtml: (value: string) => string): string {
  const initial = escapeHtml(article.name.slice(0, 1).toUpperCase());
  const photoAttributes = article.photoFileId
    ? ` data-photo-file-id="${escapeHtml(article.photoFileId)}" data-photo-fallback="${initial}" data-photo-variant="thumbnail"`
    : "";

  if (article.photoDataUrl) {
    return `<img class="article-symbol article-thumbnail" src="${escapeHtml(article.photoDataUrl)}" alt="" aria-hidden="true" />`;
  }
  return `<span class="article-symbol"${photoAttributes} aria-hidden="true">${initial}</span>`;
}
