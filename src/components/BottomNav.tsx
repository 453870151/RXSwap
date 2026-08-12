"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "@/components/LanguageProvider";
import clsx from "clsx";

interface RouteTab {
  key: string;
  href: string;
  icon: React.FC<{ className?: string }>;
  disabled?: boolean;
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5" />
      <path d="M20 10v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function SwapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4 3 8l4 4" />
      <path d="M3 8h14" />
      <path d="m17 20 4-4-4-4" />
      <path d="M21 16H7" />
    </svg>
  );
}

function LiquidityIcon({ className }: { className?: string }) {
  // Two overlapping circles — a liquidity "pool" where two tokens merge.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="6.5" />
      <circle cx="15" cy="12" r="6.5" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function BridgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21V11" />
      <path d="M21 21V11" />
      <path d="M3 11c0-4.5 18-4.5 18 0" />
      <path d="M7 21v-4" />
      <path d="M17 21v-4" />
    </svg>
  );
}

const ROUTE_TABS: RouteTab[] = [
  { key: "home", href: "https://rxexchange.io/", icon: HomeIcon },
  { key: "swap", href: "/swap", icon: SwapIcon },
  { key: "liquidity", href: "/liquidity", icon: LiquidityIcon },
  // Cross-chain bridge — placeholder for now, not clickable (like Limit).
  { key: "bridge", href: "#", icon: BridgeIcon, disabled: true },
];

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { t, i18n } = useTranslation();

  // Warm up every nav route's JS chunk on mount so navigation feels instant
  // (router.push from a button does not prefetch automatically).
  useEffect(() => {
    ROUTE_TABS.forEach((tab) => {
      if (!tab.href.startsWith("http") && !tab.href.startsWith("#")) {
        router.prefetch(tab.href);
      }
    });
  }, [router]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const switchLang = () => {
    i18n.changeLanguage(i18n.language === "en" ? "zh-TW" : "en");
  };

  const langLabel = i18n.language === "en" ? "EN" : "繁中";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06] bg-[#0B0C15]/90 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md items-center justify-around">
        {ROUTE_TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          if (tab.disabled) {
            return (
              <button
                key={tab.key}
                type="button"
                className={clsx(
                  "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-200 text-[#7A8A9A]"
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="text-[10px] font-medium tracking-wide">{t(`bottomNav.${tab.key}`)}</span>
              </button>
            );
          }
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                if (tab.href.startsWith('http') || tab.href.startsWith('#')) {
                  window.open(tab.href, '_blank');
                } else {
                  router.push(tab.href);
                }
              }}
              onMouseEnter={() => {
                if (!tab.href.startsWith('http') && !tab.href.startsWith('#')) {
                  router.prefetch(tab.href);
                }
              }}
              onTouchStart={() => {
                if (!tab.href.startsWith('http') && !tab.href.startsWith('#')) {
                  router.prefetch(tab.href);
                }
              }}
              className={clsx(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors duration-200",
                active ? "text-[#C8A951]" : "text-[#7A8A9A]"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-[10px] font-medium tracking-wide">{t(`bottomNav.${tab.key}`)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
