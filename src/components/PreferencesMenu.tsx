"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { useTranslation } from "./LanguageProvider";
import { LOCALES, changeLanguage } from "@/locales/i18n";
import { useTheme, type Theme } from "@/hooks/useTheme";

function SunIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="M4.93 4.93l1.41 1.41" />
      <path d="M17.66 17.66l1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="M6.34 17.66l-1.41 1.41" />
      <path d="M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// Rendered in the header next to the connect-wallet button while the wallet
// is NOT connected. All colors go through CSS variables so the panel itself
// follows the active theme.
//
// The panel is a two-page drill-in (Uniswap-style): the main page lists
// theme + language; clicking the language row slides the panel sideways to a
// dedicated language page with a "< 語言" back header and a checkmark on the
// active locale. Implemented as a 200%-wide track translated between pages.
//
// Placement: desktop shows an absolute dropdown under the button; mobile
// (<768px) shows a bottom sheet portalled to <body> (backdrop + drag handle +
// slide-up), mirroring ChainSwitcher's pattern.
export function PreferencesMenu() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  // Drill-in page: "main" = prefs list, "lang" = language picker.
  const [view, setView] = useState<"main" | "lang">("main");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Portal target is only available on the client.
  useEffect(() => setMounted(true), []);

  // Close on outside click / Escape.
  // The mobile sheet is portalled to body, so we check sheetRef as well.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideRoot = rootRef.current?.contains(target);
      const insideSheet = sheetRef.current?.contains(target);
      if (!insideRoot && !insideSheet) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reopening the panel always lands on the main page (the sheet is hidden
  // while closed, so this snap is invisible).
  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  const currentLocale =
    LOCALES.find((l) => l.id === i18n.language) ?? LOCALES[0];

  const themeOption = (key: Theme, icon: React.ReactNode, label: string) => {
    const isActive = theme === key;
    return (
      <button
        key={key}
        type="button"
        onClick={() => setTheme(key)}
        title={label}
        aria-pressed={isActive}
        className="flex h-7 w-9 items-center justify-center rounded-full transition-all duration-200"
        style={
          isActive
            ? { background: "rgba(200,169,81,0.2)", color: "#C8A951" }
            : { color: "var(--text-muted)" }
        }
      >
        {icon}
      </button>
    );
  };

  // Shared content for both the desktop dropdown and the mobile bottom sheet:
  // a 200%-wide sliding track with the prefs page and the language page.
  const panelContent = (
    <div
      className="flex w-[200%] items-start transition-transform duration-300 ease-out"
      style={{
        transform: view === "lang" ? "translateX(-50%)" : "translateX(0)",
      }}
    >
      {/* Page 1: main preferences. */}
      <div className="w-1/2 shrink-0 p-4">
        <p
          className="text-[15px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          {t("prefs.title")}
        </p>

        {/* Theme: sun / moon segmented control (default = moon/dark). */}
        <div className="mt-3 flex items-center justify-between">
          <span
            className="text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            {t("prefs.theme")}
          </span>
          <div
            className="flex items-center gap-0.5 rounded-full p-0.5"
            style={{
              background: "var(--input-bg)",
              border: "1px solid var(--border)",
            }}
          >
            {themeOption("light", <SunIcon />, t("theme.light"))}
            {themeOption("dark", <MoonIcon />, t("theme.dark"))}
          </div>
        </div>

        {/* Language row: drills into the language page (">" chevron). */}
        <button
          type="button"
          onClick={() => setView("lang")}
          className="mt-1 flex w-full items-center justify-between rounded-lg py-2.5 pr-1 transition-colors"
        >
          <span
            className="text-[13px]"
            style={{ color: "var(--text-muted)" }}
          >
            {t("prefs.language")}
          </span>
          <span
            className="flex items-center gap-1.5 text-[13px] font-medium"
            style={{ color: "var(--text)" }}
          >
            {currentLocale.label}
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              aria-hidden="true"
              style={{ color: "var(--text-muted)" }}
            >
              <path
                d="M4.5 2.5L8 6l-3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
      </div>

      {/* Page 2: language picker with "< 語言" back header. */}
      <div className="w-1/2 shrink-0 p-4">
        <button
          type="button"
          onClick={() => setView("main")}
          className="flex items-center gap-1.5 text-[15px] font-semibold"
          style={{ color: "var(--text)" }}
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M7.5 2.5L4 6l3.5 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("prefs.language")}
        </button>

        <div className="mt-2 flex flex-col">
          {LOCALES.map((l) => {
            const isActive = l.id === i18n.language;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  changeLanguage(l.id);
                  setView("main");
                }}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-[13px] transition-colors hover:bg-[var(--hover)]"
                style={
                  isActive
                    ? { color: "#C8A951" }
                    : { color: "var(--text)" }
                }
              >
                <span>{l.label}</span>
                {isActive && (
                  <svg
                    className="h-3.5 w-3.5 shrink-0"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M2.5 7.5L6 11l5.5-6.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full transition-all duration-300 hover:bg-[var(--hover)]"
        style={{ color: "var(--text-muted)" }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="8"
          style={{ width: "20px", height: "20px", cursor: "pointer", color: "var(--svg-color)" }}
        >
          <path d="M4.02002 14C2.91602 14 2.01501 13.104 2.01501 12C2.01501 10.896 2.90501 10 4.01001 10H4.02002C5.12402 10 6.02002 10.896 6.02002 12C6.02002 13.104 5.12502 14 4.02002 14ZM14.02 12C14.02 10.896 13.124 10 12.02 10H12.01C10.906 10 10.015 10.896 10.015 12C10.015 13.104 10.915 14 12.02 14C13.125 14 14.02 13.104 14.02 12ZM22.02 12C22.02 10.896 21.124 10 20.02 10H20.01C18.906 10 18.015 10.896 18.015 12C18.015 13.104 18.915 14 20.02 14C21.125 14 22.02 13.104 22.02 12Z" fill="currentColor"></path>
        </svg>
      </button>

      {/* Desktop dropdown — hidden on mobile. */}
      <div
        role="menu"
        className={clsx(
          "absolute right-0 z-[60] mt-3 hidden w-[270px] overflow-hidden rounded-2xl transition-all duration-200 md:block",
          open
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0 pointer-events-none"
        )}
        style={{
          background: "var(--modal-bg)",
          border: "1px solid var(--glass-border)",
          boxShadow: "var(--card-shadow)",
        }}
      >
        {panelContent}
      </div>

      {/* Mobile bottom sheet — portalled to body so it floats above BottomNav. */}
      {mounted &&
        createPortal(
          <div
            ref={sheetRef}
            className="md:hidden"
            aria-hidden={!open}
          >
            <div
              className={clsx(
                "fixed inset-0 z-[60] bg-black/60 transition-opacity",
                open
                  ? "visible opacity-100"
                  : "invisible opacity-0 pointer-events-none"
              )}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="menu"
              className={clsx(
                "fixed inset-x-0 bottom-0 z-[70] overflow-hidden rounded-modal-radius pb-[env(safe-area-inset-bottom)] transition-all duration-200 ease-out",
                open
                  ? "visible translate-y-0 opacity-100"
                  : "invisible translate-y-full opacity-0 pointer-events-none"
              )}
              style={{
                background: "var(--modal-bg)",
                border: "1px solid var(--glass-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-2.5 pb-1">
                <div
                  className="h-1 w-10 rounded-full"
                  style={{ background: "var(--text-muted)", opacity: 0.4 }}
                />
              </div>
              {panelContent}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
