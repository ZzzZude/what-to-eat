import { messages } from "./messages";

export const LOCALE_COOKIE = "what-to-eat-language";
export const LOCALES = ["zh", "ja", "en"] as const;
export type Locale = typeof LOCALES[number];
export const languageTags: Record<Locale, string> = { zh: "zh-CN", ja: "ja", en: "en" };

export type LocalizedText = { key: string; values: Record<string, string | number | LocalizedText> };
export type TranslationInput = string | LocalizedText;

export function readLocale(value: unknown): Locale {
  return value === "ja" || value === "en" ? value : "zh";
}

// Keep message keys in state so an existing notice changes language immediately.
export function message(key: string, values: LocalizedText["values"] = {}): LocalizedText {
  return { key, values };
}

export function translate(locale: Locale, input: TranslationInput, values: LocalizedText["values"] = {}): string {
  const key = typeof input === "string" ? input : input.key;
  const parameters = typeof input === "string" ? values : input.values;
  const entry = Object.hasOwn(messages, key) ? messages[key] : undefined;
  const template = locale === "zh" ? key : entry?.[locale === "ja" ? 0 : 1] ?? key;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (placeholder, name: string) => {
    if (!Object.hasOwn(parameters, name)) return placeholder;
    const value = parameters[name];
    return typeof value === "object" ? translate(locale, value) : String(value);
  });
}

export function localeCookie(locale: Locale, secure: boolean): string {
  return `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? "; Secure" : ""}`;
}
