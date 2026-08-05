// i18next setup for RXSwap.
// Locales are stored as JSON in src/locales (en.json, zh-TW.json).
//
// Language is persisted in a COOKIE (rxswap-locale) so the SERVER can read it
// (next/headers in RootLayout) and pass it down to the client LanguageProvider,
// which applies it BEFORE rendering children. This keeps the server-rendered
// language identical to the first client render, avoiding hydration mismatches
// (e.g. "Home" vs "首頁").
//
// IMPORTANT: this module pulls in react-i18next, so it must only be imported by
// CLIENT components. Server components (like layout.tsx) must NOT import it —
// otherwise react-i18next's createContext blows up in the RSC environment.

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zhTW from "./zh-TW.json";

export const LOCALES = [
  { id: "zh-TW", label: "繁體中文", short: "繁中" },
  { id: "en", label: "English", short: "EN" },
] as const;

export const DEFAULT_LOCALE = "en";
export const LOCALE_STORAGE_KEY = "rxswap-locale";
export type AppLocale = (typeof LOCALES)[number]["id"];

function isAppLocale(v: string | undefined | null): v is AppLocale {
  return v === "en" || v === "zh-TW";
}

// Read the persisted locale from the cookie, on the client. The server reads
// the cookie separately via next/headers and passes the value down as a prop,
// so we never import this module into a server component.
function readCookieLocale(): AppLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  const m = document.cookie.match(/(?:^|;\s*)rxswap-locale=([^;]+)/);
  if (m && isAppLocale(m[1])) return m[1];
  return DEFAULT_LOCALE;
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      "zh-TW": { translation: zhTW },
    },
    lng: readCookieLocale(),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnNull: false,
  });
}

// Apply a locale passed from the server (RootLayout -> LanguageProvider) BEFORE
// rendering children, so SSR output already uses the correct language.
// Synchronous for inlined resources. Does NOT touch the cookie.
export function syncLocale(locale: AppLocale) {
  if (i18n.language !== locale) {
    void i18n.changeLanguage(locale);
  }
}

export function changeLanguage(locale: AppLocale) {
  void i18n.changeLanguage(locale);
  if (typeof window !== "undefined") {
    try {
      document.cookie = `${LOCALE_STORAGE_KEY}=${locale}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = locale;
    } catch {
      /* ignore */
    }
  }
}

export default i18n;
