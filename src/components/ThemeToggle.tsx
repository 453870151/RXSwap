"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "./LanguageProvider";

type Theme = "light" | "dark" | "system";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (theme === "dark" || (theme === "system" && sysDark)) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  localStorage.setItem("theme", theme);
}

const OPTIONS: { key: Theme; label: string; icon: string }[] = [
  { key: "light", label: "Light", icon: "☀" },
  { key: "dark", label: "Dark", icon: "☾" },
  { key: "system", label: "System", icon: "◐" },
];

export function ThemeToggle() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = (localStorage.getItem("theme") as Theme) || "system";
    setTheme(stored);
    applyTheme(stored);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem("theme") || "system") === "system") applyTheme("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="glass flex items-center gap-0.5 rounded-full p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          onClick={() => {
            setTheme(o.key);
            applyTheme(o.key);
          }}
          title={t(`theme.${o.key}`)}
          className={clsx(
            "flex h-8 w-8 items-center justify-center rounded-full text-sm transition-all duration-300",
            theme === o.key
              ? "bg-brand-gradient text-white shadow-glow-soft"
              : "text-[var(--text-muted)] hover:text-[var(--text)]"
          )}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}
