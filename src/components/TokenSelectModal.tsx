"use client";

import { useState, useMemo } from "react";
import { getTokenList, type SwapToken } from "@/config/tokens";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";
import type { Address } from "@/lib/swap";

export function TokenSelectModal({
  open,
  chainId,
  exclude,
  onClose,
  onSelect,
}: {
  open: boolean;
  chainId: number | undefined;
  exclude?: Address;
  onClose: () => void;
  onSelect: (t: SwapToken) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const tokens = useMemo(() => getTokenList(chainId ?? 0), [chainId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tokens;
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
    );
  }, [tokens, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="glass w-full max-w-md animate-fade-up rounded-3xl p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">{t("swap.selectToken")}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)]"
          >
            ✕
          </button>
        </div>
        <div className="input-card mb-3 flex items-center rounded-2xl px-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="max-h-80 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              {t("common.noTokensFound")}
            </p>
          )}
          {filtered.map((t) => {
            const disabled =
              !!exclude && t.address.toLowerCase() === exclude.toLowerCase();
            return (
              <button
                key={t.address}
                disabled={disabled}
                onClick={() => {
                  onSelect(t);
                  onClose();
                  setQuery("");
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-[var(--hover)] disabled:opacity-40"
              >
                <TokenLogo token={t} size={36} />
                <div className="leading-tight">
                  <div className="font-semibold">{t.symbol}</div>
                  <div className="text-xs text-[var(--text-muted)]">{t.name}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
