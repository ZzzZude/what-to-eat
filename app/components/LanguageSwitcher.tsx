"use client";

import { LOCALES } from "@/lib/i18n";
import { useLanguage } from "./LanguageProvider";
import styles from "./language.module.css";

const labels = { zh: "中文", ja: "日本語", en: "English" } as const;

export default function LanguageSwitcher() {
  const { locale, setLocale, persistenceError, t } = useLanguage();
  return (
    <div className={styles.container}>
      <div className={styles.choices} role="group" aria-label={t("选择语言")}>
        {LOCALES.map((value) => (
          <button key={value} type="button" lang={value === "zh" ? "zh-CN" : value} aria-pressed={locale === value} onClick={() => setLocale(value)}>
            {labels[value]}
          </button>
        ))}
      </div>
      {persistenceError && <p className={styles.notice} role="status">{t("当前浏览器无法保存语言选择，本次访问仍可使用。")}</p>}
    </div>
  );
}
