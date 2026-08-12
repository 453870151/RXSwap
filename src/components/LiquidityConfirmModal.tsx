"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { formatNumber, formatUsd, formatSlippage } from "@/lib/format";
import type { SwapToken } from "@/config/tokens";
import { SWAP_FEE_BPS } from "@/config/contracts";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";
import { useTokenPrices } from "@/hooks/useAllPools";

export function LiquidityConfirmModal({
  open,
  onClose,
  onConfirm,
  tokenA,
  tokenB,
  amountAValue,
  amountBValue,
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

  // USD estimates for the two deposit amounts. Prices are already fetched by
  // the parent page, so this query is deduped by React Query.
  const chainId = tokenA.chainId;
  const { data: prices } = useTokenPrices(chainId, [tokenA, tokenB]);

  const amountAUsd = useMemo(() => {
    const usd = prices?.get(tokenA.address.toLowerCase());
    const amt = parseFloat(amountAValue || "0");
    if (usd == null || !isFinite(amt) || amt <= 0) return null;
    return amt * usd;
  }, [prices, tokenA.address, amountAValue]);

  const amountBUsd = useMemo(() => {
    const usd = prices?.get(tokenB.address.toLowerCase());
    const amt = parseFloat(amountBValue || "0");
    if (usd == null || !isFinite(amt) || amt <= 0) return null;
    return amt * usd;
  }, [prices, tokenB.address, amountBValue]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="w-full max-w-md animate-fade-up border border-white/[0.1] bg-[var(--modal-bg)] p-5 shadow-2xl rounded-modal-radius"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/55">
            {t("liquidity.creatingPosition")}
          </span>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/55 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
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

        {/* Pair title + overlapping logos */}
        <div className="mt-5 flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">
              {tokenA.symbol} / {tokenB.symbol}
            </h3>
            {/* <div className="mt-2 flex items-center gap-1.5">
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/70">
                v2
              </span>
              <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-medium text-white/70">
                {formatSlippage(SWAP_FEE_BPS)}%
              </span>
            </div> */}
          </div>
          <span className="relative flex shrink-0">
            <TokenLogo token={tokenA} size={40} />
            <span className="relative -ml-3">
              <TokenLogo token={tokenB} size={40} />
            </span>
          </span>
        </div>

        {/* Depositing amounts */}
        <div className="mt-2">
          <p className="text-sm text-white/50">{t("liquidity.depositing")}</p>
          <div className="mt-3 space-y-3.5">
            <div>
              <p className="text-base font-bold tabular-nums text-white">
                {amountAValue} {tokenA.symbol}
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-white/45">
                {amountAUsd != null ? `US${formatUsd(amountAUsd)}` : ""}
              </p>
            </div>
            <div>
              <p className="text-base font-bold tabular-nums text-white">
                {amountBValue} {tokenB.symbol}
              </p>
              <p className="mt-0.5 text-sm tabular-nums text-white/45">
                {amountBUsd != null ? `US${formatUsd(amountBUsd)}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 border-t border-white/[0.06]" />

        {/* You will receive */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/50">
            {t("liquidity.youWillReceive")}
          </span>
          <span className="flex items-center gap-2 text-sm font-bold tabular-nums text-white">
            <span className="relative flex shrink-0">
              <TokenLogo token={tokenA} size={20} />
              <span className="relative -ml-1.5">
                <TokenLogo token={tokenB} size={20} />
              </span>
            </span>
            {lpReceivedValue} {lpSymbol}
          </span>
        </div>

        {/* Share in pair */}
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-white/50">
            {t("liquidity.yourShareInPair")}
          </span>
          <span className="text-sm font-bold tabular-nums text-white">
            {formatNumber(shareAfter, 6)}%
          </span>
        </div>

        {/* Confirm button — stepwise: 授权 A → 授权 B → 创建 */}
        <button
          onClick={onConfirm}
          disabled={isBusy}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-radius bg-brand-gradient py-4 text-base font-bold text-[#0b0b14] transition hover:brightness-110 disabled:opacity-70"
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
            t("liquidity.create")
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
