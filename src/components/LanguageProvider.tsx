"use client";

import { useEffect } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { LOCALE_STORAGE_KEY, type AppLocale } from "@/lib/i18n";

// Thin wrapper around i18next. Mounting applies the persisted language
// choice after hydration (server + first client render stay "en").
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === "en" || saved === "zh-TW") {
        if (i18n.language !== saved) {
          void i18n.changeLanguage(saved as AppLocale);
        }
        document.documentElement.lang = saved;
      }
    } catch {
      /* ignore */
    }
  }, []);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

// Re-export so existing components can keep importing useTranslation from here.
export { useTranslation } from "react-i18next";
