"use client";

import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useTranslation } from "./LanguageProvider";
import { formatSlippage } from "@/lib/format";

const SLIPPAGE_OPTIONS = [10, 50, 100]; // 0.1% / 0.5% / 1%
const SLIPPAGE_STORAGE_KEY = "rxswap-slippage";

export interface SlippageValue {
  auto: boolean;
  bps: number;
}

/** Read the persisted slippage preference (shared by Swap and Liquidity Add). */
export function loadSavedSlippage(): SlippageValue {
  if (typeof window === "undefined") return { auto: true, bps: 50 };
  try {
    const raw = localStorage.getItem(SLIPPAGE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.auto === "boolean" && typeof parsed.bps === "number") {
        return { auto: parsed.auto, bps: parsed.bps };
      }
    }
  } catch {}
  return { auto: true, bps: 50 };
}

/**
 * Gear button + slippage settings popup, shared between the Swap card and the
 * Add-Liquidity page. Fully self-contained: open/close state, custom input,
 * hint tooltip and localStorage persistence all live here. The parent only
 * supplies the current value and an onChange handler.
 */
export function SlippageSettings({
  value,
  onChange,
  autoBps,
}: {
  value: SlippageValue;
  onChange: (next: SlippageValue) => void;
  /**
   * Bps shown as the custom-input placeholder while in auto mode. Swap passes
   * the live quote's slippage; other pages fall back to the 0.5% default.
   */
  autoBps?: number;
}) {
  const { t } = useTranslation();
  const { auto: autoSlippage, bps: slippageBps } = value;
  const [showSettings, setShowSettings] = useState(false);
  // Custom slippage typed into the input. Empty unless the user is actively
  // entering a manual value; presets/auto clear it so the input shows the
  // effective value as a placeholder instead of forcing deletion.
  const [customSlippage, setCustomSlippage] = useState("");
  const [slippageHintDismissed, setSlippageHintDismissed] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement>(null);

  // Close the popup when clicking anywhere outside it (including the gear
  // toggle, which stays inside this wrapper so its own onClick still toggles).
  useEffect(() => {
    if (!showSettings) return;
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (
        settingsWrapRef.current &&
        !settingsWrapRef.current.contains(e.target as Node)
      ) {
        setShowSettings(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [showSettings]);

  // Persist slippage preference across reloads.
  useEffect(() => {
    try {
      localStorage.setItem(SLIPPAGE_STORAGE_KEY, JSON.stringify(value));
    } catch {}
  }, [value]);

  // Placeholder for the custom input mirrors the Swap card: in auto mode it
  // shows the effective auto value (live quote slippage on Swap, else 0.5%),
  // otherwise the chosen manual value.
  const placeholderBps = autoSlippage ? autoBps ?? 50 : slippageBps;

  return (
    <div className="relative" ref={settingsWrapRef}>
      <button
        type="button"
        onClick={() => setShowSettings((s) => !s)}
        aria-label={t("swap.slippageTolerance")}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)]"
      >
        <svg
          className="h-[18px] w-[18px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {showSettings && (
        <div className="absolute right-[-5px] z-20 mt-2 w-[344px] max-w-[95vw] animate-fade-up rounded-radius border border-[var(--glass-border)] bg-[var(--modal-bg)] p-4 shadow-[var(--card-shadow)]">
          {/* Header */}
          <div className="mb-1 flex items-center justify-between">
            <p className="text-base font-bold text-[var(--text)]">
              {t("swap.slippageTolerance")}
            </p>
            <button
              onClick={() => setShowSettings(false)}
              aria-label={t("common.close")}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-white/5 hover:text-[var(--text)]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>

          {/* Row: slippage limit — 自動 toggle only */}
          <div className="flex items-center justify-between py-3">
            <span className="flex items-center gap-1.5 text-sm font-semibold text-[#d6d7de]">
              {t("swap.slippageLimit")}
              <span className="relative group">
                <button
                  type="button"
                  onClick={() => setSlippageHintDismissed((v) => !v)}
                  aria-label={t("swap.slippageHint")}
                  className="flex items-center text-[#666a7a] transition hover:text-[#9aa0b0]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <line x1="12" y1="11" x2="12" y2="16" />
                    <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                  </svg>
                </button>
                <div
                  className={clsx(
                    "absolute left-0 z-30 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.08] bg-[#1e1e1e] p-2.5 text-xs leading-relaxed text-[#b8bccb] shadow-lg transition",
                    "bottom-full mb-2 sm:bottom-auto sm:left-1/2 sm:top-full sm:-translate-x-1/2 sm:mt-2 sm:mb-0",
                    slippageHintDismissed
                      ? "pointer-events-none opacity-0"
                      : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
                  )}
                >
                  <div className="absolute bottom-[-7px] left-0 border-x-[7px] border-x-transparent border-t-[7px] border-t-white/[0.08] sm:hidden" />
                  <div className="absolute bottom-[-6px] left-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#1e1e1e] sm:hidden" />
                  <div className="absolute top-[-7px] left-1/2 hidden -translate-x-1/2 border-x-[7px] border-x-transparent border-b-[7px] border-b-white/[0.08] sm:block" />
                  <div className="absolute top-[-6px] left-1/2 hidden -translate-x-1/2 border-x-[6px] border-x-transparent border-b-[6px] border-b-[#1e1e1e] sm:block" />
                  {t("swap.slippageHint")}
                </div>
              </span>
            </span>
            <button
              onClick={() => {
                onChange({ auto: true, bps: slippageBps });
                setCustomSlippage("");
              }}
              className={clsx(
                "rounded-full px-5 py-1.5 text-[13px] font-semibold transition",
                autoSlippage
                  ? "bg-brand-gradient text-[#171717]"
                  : "border border-white/[0.06] bg-white/5 text-[#cfd0d8] hover:bg-white/10"
              )}
            >
              {t("swap.auto")}
            </button>
          </div>

          {/* Row: quick-select presets + custom input */}
          <div className="border-t border-white/[0.06] py-3">
            <p className="mb-2.5 text-sm font-semibold text-[#d6d7de]">
              {t("swap.quickSelect")}
            </p>
            <div className="flex items-center gap-1 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-1">
              {SLIPPAGE_OPTIONS.map((bps) => (
                <button
                  key={bps}
                  onClick={() => {
                    onChange({ auto: false, bps });
                    setCustomSlippage("");
                  }}
                  className={clsx(
                    "flex-1 rounded-[10px] py-2 text-[13px] font-semibold transition",
                    !autoSlippage && slippageBps === bps
                      ? "bg-brand-gradient text-[#171717]"
                      : "text-[#8f93a3] hover:bg-white/5 hover:text-[#d6d7de]"
                  )}
                >
                  {bps / 100}%
                </button>
              ))}
              <div
                className={clsx(
                  "flex flex-[1.1] items-center justify-center rounded-[10px] py-2 text-[13px] font-semibold",
                  !autoSlippage && !SLIPPAGE_OPTIONS.includes(slippageBps)
                    ? "bg-brand-gradient text-[#171717]"
                    : "bg-white/5 text-[#f5f5fa]"
                )}
              >
                <input
                  type="number"
                  value={customSlippage}
                  placeholder={formatSlippage(placeholderBps)}
                  step="0.1"
                  min="0.1"
                  onChange={(e) => {
                    const v = e.target.value;
                    setCustomSlippage(v);
                    const num = parseFloat(v);
                    if (!isNaN(num)) {
                      onChange({ auto: false, bps: Math.round(num * 100) });
                    }
                  }}
                  className="no-spinner w-10 bg-transparent text-center text-[13px] font-semibold outline-none placeholder:text-[var(--text-muted)]"
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
