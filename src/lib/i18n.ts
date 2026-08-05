// i18next setup for RXSwap.
// Locales are stored as JSON in src/locales (en.json, zh-TW.json).
// The default language is English; the user's choice is persisted to
// localStorage (rxswap-locale) and applied after mount to avoid SSR mismatch.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zhTW from "@/locales/zh-TW.json";

export const LOCALES = [
  { id: "zh-TW", label: "繁體中文", short: "繁中" },
  { id: "en", label: "English", short: "EN" },
] as const;

export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "rxswap-locale";
export type AppLocale = (typeof LOCALES)[number]["id"];

// Always initialise with the default language. The persisted choice is
// applied in LanguageProvider after mount, so server and first client
// render stay in sync (prevents hydration warnings).
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      "zh-TW": { translation: zhTW },
    },
    lng: DEFAULT_LOCALE,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnNull: false,
  });
}

export function changeLanguage(locale: AppLocale) {
  void i18n.changeLanguage(locale);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      document.documentElement.lang = locale;
    } catch {
      /* ignore */
    }
  }
}

export default i18n;
