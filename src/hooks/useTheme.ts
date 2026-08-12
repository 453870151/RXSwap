"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";
export const THEME_KEY = "theme";

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function readTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

// Shared theme state for the preferences UIs (PreferencesMenu three-dots and
// the WalletButton connected dropdown). Hydrates from localStorage after
// mount (SSR always assumes dark); layout.tsx's inline script applies the
// stored theme before first paint.
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("dark");
  useEffect(() => {
    setThemeState(readTheme());
  }, []);
  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
  };
  return { theme, setTheme };
}
