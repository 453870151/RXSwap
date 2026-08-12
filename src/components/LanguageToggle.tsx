"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { LOCALES, changeLanguage } from "@/locales/i18n";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const locale = i18n.language;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
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

  const current = LOCALES.find((l) => l.id === locale) ?? LOCALES[0];

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={current.label}
        className="glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20"></path><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z"></path></svg>
        <span className="text-[var(--text)]">{current.short}</span>
        <svg
          className={clsx(
            "h-3 w-3 text-[var(--text-muted)] transition-transform duration-300",
            open && "rotate-180"
          )}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      <div 
        role="listbox"
        className={clsx(
          "absolute right-0 z-50 mt-4 w-40 rounded-xl overflow-hidden fade-in",
          open
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0 pointer-events-none"
        )}
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid rgba(200, 169, 81, 0.2)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
        }}
      >
        {LOCALES.map((l) => {
          const isActive = l.id === locale;
          return (
            <button
              key={l.id}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => {
                changeLanguage(l.id);
                setOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-left text-[13px] transition-colors ${
                isActive
                  ? 'text-white'
                  : 'text-[#7A8A9A] hover:text-white hover:bg-white/[0.04]'
                  
              }`}
              style={isActive ? {
                background: 'linear-gradient(90deg, rgba(200,169,81,0.1) 0%, rgba(6,182,212,0.06) 100%)',
                borderLeft: '2px solid #C8A951',
              } : {}}
            >
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-amber-300 flex-shrink-0" />
                <span>{l.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
