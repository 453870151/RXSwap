"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  formatAmount,
  formatPriceImpact,
  formatSlippage,
  formatUsd,
  priceImpactColor,
} from "@/lib/format";
import type { SwapToken } from "@/config/tokens";
import { getNativeToken } from "@/config/tokens";
import { SWAP_FEE_BPS, WNATIVE } from "@/config/contracts";
import { TokenLogo } from "./TokenLogo";
import { useTranslation } from "./LanguageProvider";
import { useTokenPrices } from "@/hooks/useAllPools";
import { parseUnits } from "viem";
import type { Address } from "@/lib/swap";

type ActiveQuote = {
  rate: number;
  router?: Address;
  path: Address[];
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
  const [showDetails, setShowDetails] = useState(false);
  const [inverseRate, setInverseRate] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) {
      setShowDetails(false);
      setInverseRate(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !isBusy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, isBusy]);

  const chainId = tokenIn.chainId;

  const { data: prices } = useTokenPrices(chainId, [tokenIn, tokenOut]);

  const tokenInUsd = prices?.get(tokenIn.address.toLowerCase());
  const tokenOutUsd = prices?.get(tokenOut.address.toLowerCase());

  const payAmount = useMemo(() => {
    if (!payValue || payValue === ".") return 0n;
    try {
      return parseUnits(payValue, tokenIn.decimals);
    } catch {
      return 0n;
    }
  }, [payValue, tokenIn.decimals]);

  const receiveAmount = useMemo(() => {
    if (!receiveValue || receiveValue === ".") return 0n;
    try {
      return parseUnits(receiveValue, tokenOut.decimals);
    } catch {
      return 0n;
    }
  }, [receiveValue, tokenOut.decimals]);

  const payUsd = useMemo(() => {
    if (tokenInUsd == null || !payValue) return null;
    return Number(payValue) * tokenInUsd;
  }, [tokenInUsd, payValue]);

  const receiveUsd = useMemo(() => {
    if (tokenOutUsd == null || !receiveValue) return null;
    return Number(receiveValue) * tokenOutUsd;
  }, [tokenOutUsd, receiveValue]);

  const rateText = useMemo(() => {
    const rate = activeQuote.rate;
    if (!rate || !isFinite(rate)) return "—";
    if (inverseRate) {
      return `1 ${tokenOut.symbol} = ${formatNumberCompact(1 / rate)} ${tokenIn.symbol}`;
    }
    return `1 ${tokenIn.symbol} = ${formatNumberCompact(rate)} ${tokenOut.symbol}`;
  }, [activeQuote.rate, inverseRate, tokenIn.symbol, tokenOut.symbol]);

  const rateUsdText = useMemo(() => {
    if (tokenInUsd == null || tokenOutUsd == null) return null;
    if (inverseRate) {
      return `(${formatUsd(tokenOutUsd / tokenInUsd)})`;
    }
    return `(${formatUsd(tokenInUsd / tokenOutUsd)})`;
  }, [tokenInUsd, tokenOutUsd, inverseRate]);

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
      label: t("swap.minReceived"),
      value: `${formatAmount(activeQuote.amountOutMin, tokenOut.decimals)} ${tokenOut.symbol}`,
    };
  }, [activeQuote, t, tokenIn, tokenOut]);

  const slippageHigh = effectiveSlippageBps >= 300;

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
    >
      <div
        className="relative w-full max-m-md animate-fade-up rounded-t-[20px] border border-white/[0.06] bg-[var(--modal-bg)] p-5 shadow-2xl sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-white/65">
            {t("swap.youAreSwapping")}
          </h3>
          <button
            onClick={onClose}
            disabled={isBusy}
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            aria-label={t("common.close")}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
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

        {/* Amounts */}
        <div className="space-y-1">
          <AmountRow
            amount={payValue}
            symbol={tokenIn.symbol}
            token={tokenIn}
            usd={payUsd}
          />

          <div className="flex py-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
              className="h-5 w-5 text-white/35"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          </div>

          <AmountRow
            amount={receiveValue}
            symbol={tokenOut.symbol}
            token={tokenOut}
            usd={receiveUsd}
          />
        </div>

        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="mx-auto mt-4 flex items-center gap-1.5 text-sm text-white/55 transition hover:text-white"
        >
          <span>{showDetails ? t("swap.collapse") : t("swap.expand")}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2.5}
            stroke="currentColor"
            className="h-3.5 w-3.5 transition-transform"
            style={{ transform: showDetails ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>

        {/* Detail card */}
        <div className="mt-3 space-y-3 rounded-[20px] border border-white/[0.1] bg-[var(--modal-group-bg)] p-4 text-sm">
          {/* Rate - always visible */}
          <div className="flex items-center justify-between">
            <span className="text-white/50">{t("swap.exchangeRate")}</span>
            <button
              onClick={() => setInverseRate((v) => !v)}
              className="flex items-center gap-1.5 font-medium text-white transition hover:text-white/80"
              aria-label={t("swap.flip")}
            >
              <span>
                {rateText}
              </span>
              {/* <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2.5}
                stroke="currentColor"
                className="h-3.5 w-3.5 text-white/40"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                />
              </svg> */}
            </button>
          </div>

          {/* Slippage tolerance - always visible */}
          <div className="flex items-center justify-between">
            <span className="text-white/50">{t("swap.slippageLimit")}</span>
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
                className="font-medium text-white"
                style={slippageHigh ? { color: "#FFB237" } : undefined}
              >
                {autoSlippage ? `${t("swap.auto")} ` : ""}
                {formatSlippage(effectiveSlippageBps)}%
              </span>
            </div>
          </div>

          {/* Trading fee - expanded only */}
          {showDetails && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-white/50">
                {t("swap.tradingFee")}
                <InfoTip text={t("swap.tradingFeeHint")} />
              </span>
              <span className="font-medium text-white">
                {formatSlippage(SWAP_FEE_BPS)}%
              </span>
            </div>
          )}

          {/* Route - expanded only */}
          {showDetails && (
            <div className="flex items-center justify-between gap-3">
              <span className="flex shrink-0 items-center gap-1 text-white/50">
                {t("swap.route")}
                <InfoTip text={t("swap.routeHint")} />
              </span>
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-white">
                {activeQuote.path.map((addr, i) => {
                  const wnative = WNATIVE[chainId];
                  const tk =
                    addr.toLowerCase() === tokenIn.address.toLowerCase()
                      ? tokenIn
                      : addr.toLowerCase() === tokenOut.address.toLowerCase()
                      ? tokenOut
                      : addr.toLowerCase() === wnative.toLowerCase()
                      ? tokenIn.isNative ||
                        tokenIn.address.toLowerCase() === wnative.toLowerCase()
                        ? tokenIn
                        : tokenOut.isNative ||
                          tokenOut.address.toLowerCase() === wnative.toLowerCase()
                        ? tokenOut
                        : getNativeToken(chainId)
                      : null;
                  const symbol = tk?.symbol ?? shortenAddress(addr);
                  return (
                    <Fragment key={`${addr}-${i}`}>
                      {i > 0 && (
                        <span className="text-white/35">→</span>
                      )}
                      <span className="flex items-center gap-1 font-medium">
                        {tk && <TokenLogo token={tk} size={16} />}
                        {symbol}
                      </span>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* Minimum received / Maximum paid - expanded only */}
          {showDetails && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-white/50">
                {minOrMax.label}
                <InfoTip text={t("swap.minReceivedHint")} />
              </span>
              <span className="font-medium text-white">{minOrMax.value}</span>
            </div>
          )}

          {/* Price impact - expanded only */}
          {showDetails && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 text-white/50">
                {t("swap.priceImpact")}
                <InfoTip text={t("swap.priceImpactHint")} />
              </span>
              <span
                className="font-medium"
                style={impactColor ? { color: impactColor } : undefined}
              >
                {formatPriceImpact(priceImpact)}
              </span>
            </div>
          )}
        </div>

        {/* Confirm button */}
        <button
          onClick={onConfirm}
          disabled={isBusy}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-[20px] bg-brand-gradient py-4 text-base font-bold text-[#0b0b14] transition hover:brightness-110 disabled:opacity-80"
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

function AmountRow({
  amount,
  symbol,
  token,
  usd,
}: {
  amount: string;
  symbol: string;
  token: SwapToken;
  usd: number | null;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 flex-col">
        <span className="text-[24px] font-medium leading-tight text-white tabular-nums">
          {amount || "0"} {symbol}
        </span>
        <span className="text-[16px] text-white/65 font-medium">
          {usd != null ? 'US' + formatUsd(usd) : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-3">
        <TokenLogo token={token} size={36} />
      </div>
    </div>
  );
}

function formatNumberCompact(n: number): string {
  if (!isFinite(n)) return "0";
  if (n === 0) return "0";
  if (n < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", {
    maximumFractionDigits: n < 1 ? 6 : 4,
  });
}

function shortenAddress(address: string, chars = 4): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}…${address.slice(-chars)}`;
}

function InfoTip({ text }: { text: string }) {
  return (
    <span className="relative group">
      <span
        aria-label={text}
        className="flex items-center text-white/40 transition hover:text-white/70"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" />
        </svg>
      </span>
      <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-60 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-white/[0.08] bg-[#2a2a2a] p-2.5 text-xs leading-relaxed text-white/70 opacity-0 shadow-lg transition group-hover:opacity-100">
        <div className="absolute bottom-[-7px] left-1/2 -translate-x-1/2 border-x-[7px] border-x-transparent border-t-[7px] border-t-white/[0.08]" />
        <div className="absolute bottom-[-6px] left-1/2 -translate-x-1/2 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#2a2a2a]" />
        {text}
      </div>
    </span>
  );
}
