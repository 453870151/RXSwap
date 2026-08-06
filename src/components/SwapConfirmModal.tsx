"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatAmount,
  formatPriceImpact,
  formatSlippage,
  priceImpactColor,
} from "@/lib/format";
import type { SwapToken } from "@/config/tokens";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";

type ActiveQuote = {
  rate: number;
  priceImpact?: number;
  slippageBps: number;
} & ({ amountOutMin: bigint } | { amountInMax: bigint });

export function SwapConfirmModal({
  open,
  onClose,
  onConfirm,
  tokenIn,
  tokenOut,
  payValue,
  receiveValue,
  activeQuote,
  effectiveSlippageBps,
  autoSlippage,
  needsApproval,
  isBusy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  payValue: string;
  receiveValue: string;
  activeQuote: ActiveQuote;
  effectiveSlippageBps: number;
  autoSlippage: boolean;
  needsApproval: boolean;
  isBusy: boolean;
}) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [inverseRate, setInverseRate] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset rate direction when modal opens.
  useEffect(() => {
    if (open) setInverseRate(false);
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBusy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const rateText = useMemo(() => {
    const rate = activeQuote.rate;
    if (!rate || !isFinite(rate)) return "—";
    if (inverseRate) {
      return `1 ${tokenOut.symbol} ≈ ${(1 / rate).toFixed(6)} ${tokenIn.symbol}`;
    }
    return `1 ${tokenIn.symbol} ≈ ${rate.toFixed(6)} ${tokenOut.symbol}`;
  }, [activeQuote.rate, inverseRate, tokenIn.symbol, tokenOut.symbol]);

  const priceImpact = activeQuote.priceImpact ?? 0;
  const impactColor = priceImpactColor(priceImpact);

  const minOrMax = useMemo(() => {
    if ("amountInMax" in activeQuote) {
      return {
        label: t("swap.maxPaid"),
        value: `${formatAmount(activeQuote.amountInMax, tokenIn.decimals)} ${tokenIn.symbol}`,
      };
    }
    return {
      label: t("swap.minimumReceived"),
      value: `${formatAmount(activeQuote.amountOutMin, tokenOut.decimals)} ${tokenOut.symbol}`,
    };
  }, [activeQuote, t, tokenIn, tokenOut]);

  const slippageHigh = effectiveSlippageBps >= 300; // >= 3%

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
          <h3 className="text-lg font-bold">{t("swap.confirmSwap")}</h3>
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

        {/* Divider below the header */}
        <div className="mt-4 mb-4 h-px w-full bg-[var(--glass-border)]" />

        {/* Amounts */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold tabular-nums">{payValue}</span>
            <span className="flex items-center gap-2 text-base font-semibold">
              {tokenIn.symbol}
              <TokenLogo token={tokenIn} size={28} />
            </span>
          </div>

          <div className="flex justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              className="h-5 w-5 text-[var(--text-muted)]"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-2xl font-bold tabular-nums">
              {receiveValue}
            </span>
            <span className="flex items-center gap-2 text-base font-semibold">
              {tokenOut.symbol}
              <TokenLogo token={tokenOut} size={28} />
            </span>
          </div>
        </div>

        {/* Detail card */}
        <div className="mt-4 space-y-2.5 rounded-2xl border border-[var(--glass-border)] bg-[var(--input-bg)] p-3.5 text-sm">
          {/* Price */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">{t("swap.price")}</span>
            <button
              onClick={() => setInverseRate((v) => !v)}
              className="flex items-center gap-1.5 font-medium hover:text-[var(--text-muted)]"
              aria-label={t("swap.flip")}
            >
              {rateText}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                className="h-4 w-4 text-[var(--text-muted)]"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg>
            </button>
          </div>

          {/* Price impact */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">
              {t("swap.priceImpact")}
            </span>
            <span
              className="font-medium"
              style={impactColor ? { color: impactColor } : undefined}
            >
              {formatPriceImpact(priceImpact)}
            </span>
          </div>

          {/* Slippage tolerance */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">
              {t("swap.slippageLimit")}
            </span>
            <div className="flex items-center gap-1.5">
              {autoSlippage && slippageHigh && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4 text-[#FFB237]"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <span
                className="font-medium"
                style={slippageHigh ? { color: "#FFB237" } : undefined}
              >
                {autoSlippage ? `${t("swap.auto")}: ` : ""}
                {formatSlippage(effectiveSlippageBps)}%
              </span>
            </div>
          </div>

          {/* Minimum received / Maximum paid */}
          <div className="flex items-center justify-between">
            <span className="text-[var(--text-muted)]">{minOrMax.label}</span>
            <span className="font-medium">{minOrMax.value}</span>
          </div>
        </div>

        {/* Confirm / Close button — stepwise: 授权 X → 确认兑换 */}
        <button
          onClick={onConfirm}
          disabled={isBusy}
          className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold disabled:opacity-70"
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
              {needsApproval
                ? t("swap.approvingPlain")
                : t("swap.confirmInWallet")}
            </>
          ) : needsApproval ? (
            t("swap.approve", { symbol: tokenIn.symbol })
          ) : (
            t("swap.confirmSwap")
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
