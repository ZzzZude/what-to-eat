"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { languageTags, LOCALE_COOKIE, localeCookie, translate, type Locale, type LocalizedText, type TranslationInput } from "@/lib/i18n";

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  persistenceError: boolean;
  t: (input: TranslationInput, values?: LocalizedText["values"]) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export default function LanguageProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, updateLocale] = useState(initialLocale);
  const pathname = usePathname();
  const [persistenceError, setPersistenceError] = useState(false);
  const t = useCallback((input: TranslationInput, values?: LocalizedText["values"]) => translate(locale, input, values), [locale]);

  const setLocale = useCallback((next: Locale) => {
    updateLocale(next);
    try {
      document.cookie = localeCookie(next, window.location.protocol === "https:");
      setPersistenceError(!document.cookie.split(";").some((part) => part.trim() === `${LOCALE_COOKIE}=${next}`));
    } catch {
      setPersistenceError(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = languageTags[locale];
    document.title = t("今天吃啥");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("和朋友一起决定吃什么，或随机选择附近餐馆。"));
  }, [locale, pathname, t]);

  const value = useMemo(() => ({ locale, setLocale, persistenceError, t }), [locale, setLocale, persistenceError, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("LanguageProvider is missing");
  return context;
}
