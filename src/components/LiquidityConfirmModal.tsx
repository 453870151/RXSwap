"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatNumber, formatSlippage } from "@/lib/format";
import type { SwapToken } from "@/config/tokens";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";

export function LiquidityConfirmModal({
  open,
  onClose,
  onConfirm,
  tokenA,
  tokenB,
  amountAValue,
  amountBValue,
  rate,
  slippageBps,
  shareAfter,
  lpReceivedValue,
  lpSymbol,
  needsApprovalA,
  needsApprovalB,
  isBusy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tokenA: SwapToken;
  tokenB: SwapToken;
  amountAValue: string;
  amountBValue: string;
  rate: number;
  slippageBps: number;
  shareAfter: number;
  lpReceivedValue: string;
  lpSymbol: string;
  needsApprovalA: boolean;
  needsApprovalB: boolean;
  isBusy: boolean;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape (unless a transaction is in flight).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBusy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, isBusy]);

  const rateText = useMemo(() => {
    if (!rate || !isFinite(rate)) return null;
    return {
      a: `1 ${tokenA.symbol} ≈ ${rate.toFixed(6)} ${tokenB.symbol}`,
      b: `1 ${tokenB.symbol} ≈ ${(1 / rate).toFixed(6)} ${tokenA.symbol}`,
    };
  }, [rate, tokenA.symbol, tokenB.symbol]);

  // Pie-chart split based on the two deposit values. For an existing pool we
  // convert amountB into token-A terms via the pool rate; for a fresh pool we
  // fall back to an even 50/50 split.
  const splitPctA = useMemo(() => {
    const a = parseFloat(amountAValue || "0");
    const b = parseFloat(amountBValue || "0");
    if (a <= 0 && b <= 0) return 50;
    if (rate > 0 && isFinite(rate)) {
      const valueBInA = b / rate;
      const total = a + valueBInA;
      if (total > 0) return (a / total) * 100;
    }
    return 50;
  }, [amountAValue, amountBValue, rate]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/20 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-t-3xl border border-[var(--glass-border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--card-shadow)] sm:rounded-3xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{t("liquidity.title")}</h3>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)] disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* LP preview card */}
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-[var(--glass-border)] bg-[var(--input-bg)] p-4">
          <span className="text-sm font-semibold text-[#e8b923]">
            {t("liquidity.youWillReceive")}
          </span>
          <span className="flex items-center gap-2 text-base font-bold tabular-nums">
            <span className="relative flex shrink-0">
              <TokenLogo token={tokenA} size={28} />
              <span className="relative -ml-2.5">
                <TokenLogo token={tokenB} size={28} />
              </span>
            </span>
            <span className="truncate max-w-[120px]">{lpSymbol}</span>
            <span>{lpReceivedValue}</span>
          </span>
        </div>

        {/* Share in pair */}
        <div className="mb-4 flex items-center justify-between text-sm">
          <span className="font-semibold text-[#e8b923]">
            {t("liquidity.yourShareInPair")}
          </span>
          <span className="font-bold tabular-nums">
            {formatNumber(shareAfter, 6)}%
          </span>
        </div>

        {/* Deposit input card with pie chart */}
        <div className="mb-4 flex items-center gap-4 rounded-2xl border border-[var(--glass-border)] bg-[var(--input-bg)] p-4">
          <PieChart pctA={splitPctA} size={72} />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#f5c542]" />
                {tokenA.symbol}
              </span>
              <span className="text-sm font-bold tabular-nums">{amountAValue}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#2dd4bf]" />
                {tokenB.symbol}
              </span>
              <span className="text-sm font-bold tabular-nums">{amountBValue}</span>
            </div>
          </div>
        </div>

        {/* Detail rows */}
        <div className="space-y-2.5 text-sm">
          {rateText && (
            <div className="flex items-start justify-between">
              <span className="text-[var(--text-muted)]">{t("swap.rate")}</span>
              <span className="text-right font-medium tabular-nums">
                {rateText.a}
                <br />
                {rateText.b}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">
              {t("swap.slippageLimit")}
            </span>
            <span className="font-medium">{formatSlippage(slippageBps)}%</span>
          </div>
        </div>

        {/* Confirm button — stepwise: 授权 A → 授权 B → 确认供应 */}
        <button
          onClick={onConfirm}
          disabled={isBusy}
          className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold disabled:opacity-70"
        >
          {isBusy ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              {(needsApprovalA || needsApprovalB)
                ? t("swap.approvingPlain")
                : t("swap.confirmInWallet")}
            </>
          ) : needsApprovalA ? (
            t("swap.approve", { symbol: tokenA.symbol })
          ) : needsApprovalB ? (
            t("swap.approve", { symbol: tokenB.symbol })
          ) : (
            t("liquidity.confirmSupply")
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}

function PieChart({ pctA, size = 72 }: { pctA: number; size?: number }) {
  const r = size * 0.38;
  const stroke = size * 0.18;
  const c = 2 * Math.PI * r;
  const a = Math.max(0, Math.min(100, pctA));
  const segA = (a / 100) * c;
  const segB = c - segA;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#f5c542"
        strokeWidth={stroke}
        strokeDasharray={`${segA} ${c}`}
        strokeLinecap="butt"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#2dd4bf"
        strokeWidth={stroke}
        strokeDasharray={`${segB} ${c}`}
        strokeDashoffset={-segA}
        strokeLinecap="butt"
      />
    </svg>
  );
}
