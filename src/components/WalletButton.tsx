"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS, DEFAULT_CHAIN_ID } from "@/config/chains";
import { shortenAddress } from "@/lib/format";
import clsx from "clsx";
import { useTranslation } from "./LanguageProvider";
import { useToast } from "./Toaster";
import { LOCALES, changeLanguage } from "@/locales/i18n";
import { useTheme, type Theme } from "@/hooks/useTheme";
import Jazzicon, { jsNumberForAddress } from "react-jazzicon";

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

// Connected-wallet dropdown (方案A card style):
//   avatar + address + copy / 全局偏好設定 (theme segmented + language row) /
//   red 斷開連接 button. Language drills into a second page (same sliding-track
//   interaction as the PreferencesMenu three-dots).
// Placement mirrors ChainSwitcher/PreferencesMenu: desktop shows an absolute
// dropdown; mobile (<768px) shows a bottom sheet portalled to <body>.
export function WalletButton() {
  const { t, i18n } = useTranslation();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  // Drill-in page: "main" = account + prefs, "lang" = language picker.
  const [view, setView] = useState<"main" | "lang">("main");
  const [mounted, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  // Portal target is only available on the client.
  useEffect(() => setMounted(true), []);

  // Close on outside click / Escape. The mobile sheet is portalled to body,
  // so we check sheetRef as well.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      const insideRoot = ref.current?.contains(target);
      const insideSheet = sheetRef.current?.contains(target);
      if (!insideRoot && !insideSheet) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reopening always lands on the main page.
  useEffect(() => {
    if (!open) setView("main");
  }, [open]);

  const wrongNetwork = isConnected && chainId !== undefined && !SUPPORTED_CHAINS.includes(chainId);

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChainAsync({ chainId: DEFAULT_CHAIN_ID })}
        className="btn-gradient px-4 py-2 text-sm"
      >
        {t("common.switchNetwork")}
      </button>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="btn-gradient px-4 py-2 text-sm"
      >
        <span className="tracking-wide">
          {connecting ? t("common.connecting") : t("common.connectWallet")}
        </span>
      </button>
    );
  }

  const currentLocale =
    LOCALES.find((l) => l.id === i18n.language) ?? LOCALES[0];

  const copyAddress = () => {
    if (!address) return;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(address);
    } else {
      const ta = document.createElement('textarea');
      ta.value = address;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    toast({ type: 'success', message: t('common.copied'), position: 'top' });
  };

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

  // Shared content for the desktop dropdown and the mobile bottom sheet:
  // a 200%-wide sliding track with the main page and the language page.
  const panelContent = (
    <div
      className="flex w-[200%] items-start transition-transform duration-300 ease-out"
      style={{
        transform: view === "lang" ? "translateX(-50%)" : "translateX(0)",
      }}
    >
      {/* Page 1: account + global preferences + disconnect. */}
      <div className="w-1/2 shrink-0">
        {/* Avatar + address + copy */}
        <div className="flex items-center gap-3 px-[18px] pb-[14px] pt-[18px]">
          <Jazzicon seed={jsNumberForAddress(address ?? "")} diameter={40} />
          <div className="flex items-center gap-2 cursor-pointer"
            onClick={copyAddress}
          >
            <span
              className="font-mono text-[15px] font-semibold"
              style={{ color: "var(--text)" }}
            >
              {shortenAddress(address, 4)}
            </span>
            <button
              type="button"
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[var(--hover)]"
              style={{ color: "var(--text-muted)" }}
              title={t('common.copyAddress')}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            </button>
          </div>
        </div>

        <div className="mx-[18px] border-t" style={{ borderColor: 'rgba(200,169,81,0.1)' }} />

        {/* Global preferences (theme + language) */}
        <div className="px-[18px] pb-[14px] pt-3">
          <p
            className="mb-1 text-[11px] uppercase tracking-[0.08em]"
            style={{ color: "var(--text-muted)" }}
          >
            {t("prefs.title")}
          </p>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
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
          <button
            type="button"
            onClick={() => setView("lang")}
            className="flex w-full items-center justify-between rounded-lg py-1.5 pr-1 transition-colors"
          >
            <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
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

        <div className="mx-[18px] border-t" style={{ borderColor: 'rgba(200,169,81,0.1)' }} />

        {/* Disconnect */}
        <div className="px-[18px] pb-[18px] pt-[14px]">
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-[11px] text-[13px] font-semibold transition-colors bg-[rgba(239,68,68,0.1)] text-[#EF4444] hover:bg-[rgba(239,68,68,0.18)]"
          >
            <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.36 6.64a9 9 0 1 1-12.72 0" />
              <line x1="12" y1="2" x2="12" y2="12" />
            </svg>
            {t("common.disconnect")}
          </button>
        </div>
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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 transition-all whitespace-nowrap font-semibold h-[38px] sm:h-[42px] px-2 sm:px-3"
      >
        <div className="flex">
          <Jazzicon seed={jsNumberForAddress(address ?? "")} diameter={24} />
        </div>
        <span className="hidden sm:inline font-mono text-sm">
          {shortenAddress(address, 4)}
        </span>
      </button>

      {/* Desktop dropdown — hidden on mobile. */}
      <div
        role="menu"
        className={clsx(
          "absolute right-0 z-[60] mt-3 hidden w-[300px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl transition-all duration-200 md:block",
          open
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0 pointer-events-none"
        )}
        style={{
          background: 'var(--modal-bg)',
          border: '1px solid rgba(200,169,81,0.2)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
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
                background: 'var(--modal-bg)',
                border: '1px solid rgba(200,169,81,0.2)',
                boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
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
