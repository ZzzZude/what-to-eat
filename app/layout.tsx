import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import LanguageProvider from "./components/LanguageProvider";
import { languageTags, LOCALE_COOKIE, readLocale, translate } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return {
    title: translate(locale, "今天吃啥"),
    description: translate(locale, "和朋友一起决定吃什么，或随机选择附近餐馆。"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const locale = readLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={languageTags[locale]}>
      <body><LanguageProvider initialLocale={locale}>{children}</LanguageProvider></body>
    </html>
  );
}
