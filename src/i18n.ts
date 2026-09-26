import en from "./locales/en.json";
import fr from "./locales/fr.json";

export type Language = "en" | "fr";
export type TranslationKey = keyof typeof en;

const dictionaries: Record<Language, typeof en> = { en, fr };

export function translate(
  language: Language,
  key: TranslationKey,
  values: Record<string, string | number> = {}
): string {
  return dictionaries[language][key].replace(/\{(\w+)\}/g, (_, name: string) =>
    String(values[name] ?? `{${name}}`)
  );
}
