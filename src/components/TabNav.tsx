"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { useTranslation } from "./LanguageProvider";

const TABS = [
  { href: "/swap", key: "nav.swap" },
  { href: "/liquidity", key: "nav.liquidity" },
];

export function TabNav() {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="glass mt-8 flex items-center gap-1 self-center rounded-full p-1">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={clsx(
              "rounded-full px-6 py-2 text-sm font-semibold transition-all duration-300",
              active
                ? "bg-brand-gradient text-white shadow-glow-soft"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </div>
  );
}
