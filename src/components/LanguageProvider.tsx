"use client";

import { I18nextProvider } from "react-i18next";
import i18n, { syncLocale, type AppLocale } from "@/locales/i18n";

// Thin wrapper around i18next. The persisted language comes from the server
// (RootLayout reads the cookie and passes it here as `ssrLocale`), and we
// apply it BEFORE rendering children on BOTH the server (SSR) and the client
// (hydration). Because both renders start from the same locale, the first
// client paint matches the server HTML — no hydration text mismatch.
export function LanguageProvider({
  children,
  ssrLocale,
}: {
  children: React.ReactNode;
  ssrLocale: string;
}) {
  const locale: AppLocale = ssrLocale === "zh-TW" || ssrLocale === "en"
    ? ssrLocale
    : "en";

  // Synchronously set the i18n language before children render. This runs
  // during SSR (so the emitted HTML is in the right language) and again during
  // client hydration (so the two match). syncLocale is idempotent.
  syncLocale(locale);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

// Re-export so existing components can keep importing useTranslation from here.
export { useTranslation } from "react-i18next";
