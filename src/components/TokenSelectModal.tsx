"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { getTokenList, type SwapToken } from "@/config/tokens";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { formatAmount } from "@/lib/format";
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

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm sm:z-40 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="glass flex h-[570px] w-full animate-fade-up flex-col rounded-t-3xl p-4 sm:max-w-md sm:rounded-3xl"
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
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">
              {t("common.noTokensFound")}
            </p>
          )}
          {filtered.map((tk) => {
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
                  </div>
                </div>
                <div className="shrink-0">
                  {address ? (
                    <TokenBalanceCell
                      token={tk}
                      account={address}
                      chainId={chainId}
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
  account,
  chainId,
}: {
  token: SwapToken;
  account: Address;
  chainId: number | undefined;
}) {
  const { data, isLoading } = useTokenBalance(token, account, chainId);

  if (isLoading) {
    return (
      <Spinner className="ml-auto block h-4 w-4 text-[var(--text-muted)]" />
    );
  }

  return (
    <span className="block text-right text-sm tabular-nums text-[var(--text-muted)]">
      {data != null ? formatAmount(data, token.decimals) : "0"}
    </span>
  );
}
