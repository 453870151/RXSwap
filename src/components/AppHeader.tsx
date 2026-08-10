"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ChainSwitcher } from "./ChainSwitcher";
import { WalletButton } from "./WalletButton";
import { LanguageToggle } from "./LanguageToggle";
import { useTranslation } from "./LanguageProvider";

const NAV = [
  { href: "http://localhost:3000/", key: "nav.home", exact: true },
  { href: "/swap", key: "nav.swap" },
  { href: "/liquidity", key: "nav.liquidity" },
];

export function AppHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();

  // Warm up nav route chunks so desktop navigation (router.push from a button)
  // doesn't stall on first visit to a not-yet-loaded route segment.
  useEffect(() => {
    NAV.forEach((item) => {
      if (!item.href.startsWith("http") && !item.href.startsWith("#")) {
        router.prefetch(item.href);
      }
    });
  }, [router]);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[rgb(255_255_255/0.06)] border-b-[rgba(6,182,212,0.15)] bg-[var(--bg)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: logo + nav */}
        <div className="flex items-center gap-6 lg:gap-10">
          <Link href="/" className="flex items-center">
            <img
              src="/images/logo.png"
              alt="RXSwap"
              className="h-7 w-auto object-contain md:h-9"
            />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    if (item.href.startsWith('http') || item.href.startsWith('#')) {
                      window.open(item.href, '_blank');
                    } else {
                      router.push(item.href);
                    }
                  }}
                  onMouseEnter={() => {
                    if (!item.href.startsWith('http') && !item.href.startsWith('#')) {
                      router.prefetch(item.href);
                    }
                  }}
                  onTouchStart={() => {
                    if (!item.href.startsWith('http') && !item.href.startsWith('#')) {
                      router.prefetch(item.href);
                    }
                  }}
                  className={`nav-item group relative px-4 py-2 text-[13px] font-medium tracking-[0.03em] ${isActive ? 'nav-item-active' : ''}`}
                >
                  <span className="nav-text-wrap">
                    <span className="nav-text-default">{t(item.key)}</span>
                    <span className="nav-text-active">{t(item.key)}</span>
                  </span>
                  <span className="nav-underline" />
                </button>
              );
            })}
          </nav>
        </div>

        {/* Right: chain / language / wallet */}
        <div className="flex items-center gap-2 sm:gap-5">
          <ChainSwitcher />
          <div className="hidden md:block">
            <LanguageToggle />
          </div>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
