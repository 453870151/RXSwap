"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { getTokenList, type SwapToken } from "@/config/tokens";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";
import {
  useWalletBalances,
  useWalletUsdValues,
} from "@/hooks/useWalletUsdValues";
import { formatAmount, formatUsd } from "@/lib/format";
import { formatUnits } from "viem";
import type { Address } from "@/lib/swap";
import clsx from "clsx";

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={clsx("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="loading"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function shorten(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function TokenSelectModal({
  open,
  chainId,
  address,
  exclude,
  locked,
  onClose,
  onSelect,
}: {
  open: boolean;
  chainId: number | undefined;
  address?: Address;
  /** 对侧 token（如弹 in 时的 tokenOut）：灰色标记，但可点击=互换 */
  exclude?: Address;
  /** 当前正在编辑的 token（如弹 in 时的 tokenIn）：灰色标记，不可选中 */
  locked?: Address;
  onClose: () => void;
  onSelect: (t: SwapToken) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const tokens = useMemo(() => getTokenList(chainId ?? 0), [chainId]);
  // Balance loads fast (single batch) and renders immediately; the USD
  // valuation is a slower on-chain pricing pass that streams in afterwards.
  const { data: balanceMap, isLoading: balanceLoading } = useWalletBalances(
    chainId,
    address
  );
  const { data: usdMap } = useWalletUsdValues(chainId, address);

  // Filter by search, then sort. The native (main-chain) coin is pinned to the
  // top and never sorted. While the on-chain USD valuation is still loading we
  // sort by raw balance quantity (stable, meaningful); once valuations stream in
  // we switch to sorting by USD value descending. Tokens with no route (usd ===
  // null) sink below all valued tokens but keep a balance-based order.
  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? tokens.filter(
          (t) =>
            t.symbol.toLowerCase().includes(q) ||
            t.name.toLowerCase().includes(q) ||
            t.address.toLowerCase().includes(q)
        )
      : tokens;

    const hasUsd = usdMap != null;
    const balanceQty = (t: SwapToken) =>
      Number(formatUnits(balanceMap?.[t.address.toLowerCase()] ?? 0n, t.decimals));

    return [...list].sort((a, b) => {
      if (a.isNative !== b.isNative) return a.isNative ? -1 : 1;
      if (!hasUsd) return balanceQty(b) - balanceQty(a); // pre-valuation order

      const ua = usdMap[a.address.toLowerCase()];
      const ub = usdMap[b.address.toLowerCase()];
      const ga = ua != null ? 0 : 1; // valued group before unvalued
      const gb = ub != null ? 0 : 1;
      if (ga !== gb) return ga - gb;
      const va = ua != null ? ua : balanceQty(a);
      const vb = ub != null ? ub : balanceQty(b);
      return vb - va;
    });
  }, [tokens, query, usdMap, balanceMap]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass flex h-[570px] w-full animate-fade-up flex-col rounded-t-3xl bg-[rgb(19,19,19)] p-4 sm:max-w-[25rem] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-bold">{t("swap.selectToken")}</h3>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)]"
          >
            ✕
          </button>
        </div>
        <div className="input-card mb-3 flex shrink-0 items-center rounded-2xl px-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("common.search")}
            className="w-full bg-transparent py-3 text-sm outline-none placeholder:text-[var(--text-muted)]"
          />
        </div>
        <div className="token-select-scroll mt-1 flex-1 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              {t("common.noTokensFound")}
            </p>
          )}
          {sorted.map((tk) => {
            const isOtherSide =
              !!exclude && tk.address.toLowerCase() === exclude.toLowerCase();
            const isLocked =
              !!locked && tk.address.toLowerCase() === locked.toLowerCase();
            const rowClass = clsx(
              "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition",
              isLocked
                ? "opacity-50"
                : isOtherSide
                ? "opacity-50 hover:opacity-100 cursor-pointer"
                : "hover:bg-[var(--hover)] cursor-pointer"
            );
            return (
              <button
                key={tk.address}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  if (isLocked) return;
                  onSelect(tk);
                  onClose();
                  setQuery("");
                }}
                className={rowClass}
              >
                <TokenLogo token={tk} size={36} />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="font-semibold">{tk.symbol}</div>
                  <div className="truncate text-xs text-[var(--text-muted)]">
                    {tk.name}
                    {!tk.isNative && (
                      <span className="opacity-60">
                        {" "}
                        ({shorten(tk.address)})
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0">
                  {address ? (
                    <TokenBalanceCell
                      token={tk}
                      balance={balanceMap?.[tk.address.toLowerCase()]}
                      balanceLoading={balanceLoading}
                      usd={usdMap?.[tk.address.toLowerCase()] ?? null}
                    />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}

function TokenBalanceCell({
  token,
  balance,
  balanceLoading,
  usd,
}: {
  token: SwapToken;
  balance?: bigint;
  balanceLoading: boolean;
  /** USD value, or null when no on-chain route to a stable exists. */
  usd: number | null;
}) {
  // Only the balance gets a spinner — show it as soon as it's queried.
  if (balanceLoading) {
    return (
      <Spinner className="ml-auto block h-4 w-4 text-[var(--text-muted)]" />
    );
  }

  // USD streams in separately and only renders when it's a meaningful amount
  // (> 0 and at least 1 cent). 0 or no-route ("—") shows nothing but the balance.
  const showUsd = usd != null && usd >= 0.01;

  return (
    <div className="text-right leading-tight">
      <div className="text-sm tabular-nums text-[var(--text-muted)]">
        {formatAmount(balance ?? 0n, token.decimals)}
      </div>
      {showUsd && (
        <div className="text-xs tabular-nums text-[var(--text-muted)] opacity-70">
          {formatUsd(usd)}
        </div>
      )}
    </div>
  );
}
