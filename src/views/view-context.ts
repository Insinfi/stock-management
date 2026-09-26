import type { TranslationKey } from "../i18n";

export interface ViewContext {
  t(key: TranslationKey, values?: Record<string, string | number>): string;
  escapeHtml(value: string): string;
  formatNumber(value: number): string;
}
