"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, usePublicClient } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import clsx from "clsx";
import { bsc } from "wagmi/chains";
import {
  getTokenList,
  getNativeToken,
  getTokenByAddress,
  type SwapToken,
} from "@/config/tokens";
import { getRouterAddresses } from "@/config/contracts";
import { useSwapQuote } from "@/hooks/useSwapQuote";
import { useSwapQuoteOut } from "@/hooks/useSwapQuoteOut";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useSwapWrite } from "@/hooks/useSwapWrite";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { TokenSelectModal } from "./TokenSelectModal";
import { useTranslation } from "./LanguageProvider";
import { formatAmount } from "@/lib/format";
import { getChainMeta, SUPPORTED_CHAINS } from "@/config/chains";
import type { Address } from "@/lib/swap";

const SLIPPAGE_OPTIONS = [10, 50, 100]; // 0.1% / 0.5% / 1%
const SLIPPAGE_STORAGE_KEY = "rxswap-slippage";

function loadSavedSlippage(): { auto: boolean; bps: number } {
  if (typeof window === "undefined") return { auto: true, bps: 50 };
  try {
    const raw = localStorage.getItem(SLIPPAGE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.auto === "boolean" &&
        typeof parsed.bps === "number"
      ) {
        return { auto: parsed.auto, bps: parsed.bps };
      }
    }
  } catch {}
  return { auto: true, bps: 50 };
}

export function SwapCard() {
  const { t } = useTranslation();
  const { address, isConnected, chainId: connectedChain, chain } = useAccount();
  // If the connected wallet's chain is configured in the project, use it so the
  // native token becomes the default "from" token. Otherwise fall back to BSC
  // (56) for display and surface an "unsupported chain" notice.
  const connectedChainSupported =
    isConnected && SUPPORTED_CHAINS.includes(connectedChain ?? -1);
  const chainId = connectedChainSupported ? (connectedChain as number) : bsc.id;
  const unsupportedChain = isConnected && !connectedChainSupported;
  const publicClient = usePublicClient({ chainId });
  const { toast, update } = useToast();
  const { approve } = useApprove();
  const { swap, isPending: swapping } = useSwapWrite();
  const { connect, connectors, isPending: connecting } = useConnect();
  const queryClient = useQueryClient();

  // Seed defaults immediately (BSC native in, first stable out) so neither
  // field ever flashes an empty "Select" button before the effect runs.
  const [tokenIn, setTokenIn] = useState<SwapToken | undefined>(() =>
    getNativeToken(bsc.id)
  );
  const [tokenOut, setTokenOut] = useState<SwapToken | undefined>(() => {
    const list = getTokenList(bsc.id);
    return list.find((t) => !t.isNative) ?? list[0];
  });
  // Single source of truth: which field the user is editing, and the typed text.
  const [independentField, setIndependentField] = useState<"in" | "out">("in");
  const [typedValue, setTypedValue] = useState("");
  const savedSlippage = useMemo(() => loadSavedSlippage(), []);
  const [slippageBps, setSlippageBps] = useState(savedSlippage.bps);
  const [autoSlippage, setAutoSlippage] = useState(savedSlippage.auto);
  // Custom slippage typed into the input. Empty unless the user is actively
  // entering a manual value; presets/auto clear it so the input shows the
  // effective value as a placeholder instead of forcing deletion.
  const [customSlippage, setCustomSlippage] = useState("");
  const [modalSide, setModalSide] = useState<"in" | "out" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showInverseRate, setShowInverseRate] = useState(false);
  const [busy, setBusy] = useState(false);

  // Persist slippage preference across reloads.
  useEffect(() => {
    try {
      localStorage.setItem(
        SLIPPAGE_STORAGE_KEY,
        JSON.stringify({ auto: autoSlippage, bps: slippageBps })
      );
    } catch {}
  }, [autoSlippage, slippageBps]);

  // Defaults: native in, first stable out.
  useEffect(() => {
    const list = getTokenList(chainId);
    const native = getNativeToken(chainId);
    setTokenIn((prev) =>
      prev && getTokenByAddress(chainId, prev.address) ? prev : native
    );
    setTokenOut((prev) => {
      if (prev && getTokenByAddress(chainId, prev.address)) return prev;
      return list.find((t) => !t.isNative) ?? list[0];
    });
    // Switching chain resets the typed amount so the user starts fresh for the
    // new pair / liquidity landscape.
    setTypedValue("");
    setIndependentField("in");
  }, [chainId]);

  const isExactOut = independentField === "out";

  // Forward quote (typing in "pay") and reverse quote (typing in "receive").
  const forwardQuote = useSwapQuote({
    tokenIn,
    tokenOut,
    amountIn: isExactOut ? "" : typedValue,
    slippageBps,
    autoSlippage,
    chainId,
  });
  const reverseQuote = useSwapQuoteOut({
    tokenIn,
    tokenOut,
    amountOut: isExactOut ? typedValue : "",
    slippageBps,
    autoSlippage,
    chainId,
  });

  const { data: balanceIn } = useTokenBalance(tokenIn, address, chainId);
  const { data: balanceOut } = useTokenBalance(tokenOut, address, chainId);
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    tokenIn,
    address,
    tokenIn && getRouterAddresses(chainId).primary,
    chainId
  );

  // Derived wei amounts for the active direction.
  const amountInWei = useMemo(() => {
    if (isExactOut) return reverseQuote.data?.amountIn ?? 0n;
    if (!tokenIn || !typedValue) return 0n;
    try {
      return parseUnits(typedValue, tokenIn.decimals);
    } catch {
      return 0n;
    }
  }, [isExactOut, reverseQuote.data, tokenIn, typedValue]);

  const amountOutWei = useMemo(() => {
    if (!isExactOut) return forwardQuote.data?.amountOut ?? 0n;
    if (!tokenOut || !typedValue) return 0n;
    try {
      return parseUnits(typedValue, tokenOut.decimals);
    } catch {
      return 0n;
    }
  }, [isExactOut, forwardQuote.data, tokenOut, typedValue]);

  // The amount the user actually spends: exact-in → amountIn; exact-out → amountInMax.
  const payWei = isExactOut ? reverseQuote.data?.amountInMax ?? 0n : amountInWei;
  const amountOutMinWei = isExactOut
    ? amountOutWei
    : forwardQuote.data?.amountOutMin ?? 0n;

  const activeQuote = isExactOut ? reverseQuote.data : forwardQuote.data;
  const isFetching = isExactOut ? reverseQuote.isFetching : forwardQuote.isFetching;

  // Effective slippage to display: the quote hook already resolved auto vs
  // manual into `slippageBps`. Fall back to 0.5% (auto floor) / manual value
  // when no quote is present yet.
  const effectiveSlippageBps =
    activeQuote?.slippageBps ?? (autoSlippage ? 50 : slippageBps);

  // True when the user actually entered a non-zero amount in either box.
  // Used so the button only shows "請輸入數量" when nothing was typed — typing
  // in the receive (Token2) box must NOT trigger the "enter amount" prompt
  // while the reverse quote is still resolving (payWei is 0 mid-fetch).
  const hasAmountInput = typedValue.trim() !== "" && Number(typedValue) > 0;

  const needsApproval =
    !!tokenIn &&
    !tokenIn.isNative &&
    payWei > 0n &&
    allowance < payWei;

  const balanceInNum = balanceIn ?? 0n;
  const balanceOutNum = balanceOut ?? 0n;
  const insufficient = payWei > balanceInNum;

  // Displayed input values.
  // - The box the user is actively typing in always shows `typedValue`
  //   directly (never blanked), so decimals like "0.1" type fine through the
  //   intermediate "0" / "0." steps.
  // - The opposite (derived) box is cleared whenever the typed value is not a
  //   positive amount — i.e. truly empty OR parseable to 0 ("0", "0.0",
  //   "0.00"). This way clearing the focused box, or entering "0.00", also
  //   clears the other box.
  const payValue = isExactOut
    ? !hasAmountInput
      ? ""
      : reverseQuote.data
      ? formatAmount(reverseQuote.data.amountIn, tokenIn?.decimals ?? 18)
      : ""
    : typedValue;
  const receiveValue = isExactOut
    ? typedValue
    : !hasAmountInput
    ? ""
    : forwardQuote.data
    ? formatAmount(forwardQuote.data.amountOut, tokenOut?.decimals ?? 18)
    : "";

  function onTypeIn(v: string) {
    setIndependentField("in");
    setTypedValue(v);
  }
  function onTypeOut(v: string) {
    setIndependentField("out");
    setTypedValue(v);
  }

  // Mirror PancakeSwap/andros-swap switchCurrencies: swap tokens, flip the
  // independent field, and KEEP typedValue. The value stays attached to the
  // field role, so the now-dependent box recalculates automatically.
  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setIndependentField((f) => (f === "in" ? "out" : "in"));
  }

  function onSelect(side: "in" | "out", tk: SwapToken) {
    if (side === "in") {
      // Picking the token currently on the other side moves it here, and the
      // old "in" token takes its place — a swap, not a disable. (Matches the
      // "I clicked USDT in Token1's list → Token1=USDT, Token2=BNB" behavior.)
      if (tokenOut && tk.address === tokenOut.address) {
        setTokenOut(tokenIn);
      }
      setTokenIn(tk);
    } else {
      if (tokenIn && tk.address === tokenIn.address) {
        setTokenIn(tokenOut);
      }
      setTokenOut(tk);
    }
    // Requirement 1: if the user already typed an amount, KEEP it after the
    // token change. The independent field's value stays attached to its box and
    // the opposite box's quote recomputes for the new token automatically.
    // Only when nothing was typed do we reset to a clean state.
    if (!typedValue) {
      setTypedValue("");
      setIndependentField("in");
    }
  }

  function setMax() {
    if (!tokenIn || balanceIn == null) return;
    setIndependentField("in");
    if (tokenIn.isNative) {
      const buffer = parseUnits("0.01", tokenIn.decimals);
      setTypedValue(
        formatAmount(balanceIn > buffer ? balanceIn - buffer : 0n, tokenIn.decimals)
      );
    } else {
      setTypedValue(formatAmount(balanceIn, tokenIn.decimals));
    }
  }

  // Same as setMax but for the "receive" (Token2) box: clicking the balance
  // fills the input with the maximum Token2 balance (exact-out target).
  function setMaxOut() {
    if (!tokenOut || balanceOut == null) return;
    setIndependentField("out");
    setTypedValue(formatAmount(balanceOut, tokenOut.decimals));
  }

  async function handleAction() {
    if (!tokenIn || !tokenOut || !address || !publicClient) return;
    if (unsupportedChain) return;
    if (payWei <= 0n) return;
    setBusy(true);
    const router = getRouterAddresses(chainId).primary;
    // Track the active pending toast id so we can resolve/dismiss it cleanly
    // on success, rejection, or any other failure (pending toasts never auto-close).
    let pendingId: number | undefined;
    try {
      if (needsApproval) {
        pendingId = toast({
          type: "pending",
          message: t("toast.approving", { symbol: tokenIn.symbol }),
        });
        const h = await approve(tokenIn.address, router, maxUint256);
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: h,
          timeout: 180_000,
        });
        if (receipt.status !== "success") {
          // On-chain execution reverted — this is not a valid approval.
          queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
          update(pendingId, { type: "error", message: t("toast.txFailed") });
          return;
        }
        // Approval is a transaction too — refresh the allowance so the "授权"
        // button flips back to "兑换", and refresh balances.
        await refetchAllowance();
        queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
        update(pendingId, {
          type: "success",
          message: t("toast.approved", { symbol: tokenIn.symbol }),
        });
        pendingId = undefined;
      }
      const q = activeQuote;
      if (!q) {
        toast({ type: "error", message: t("swap.noRoute") });
        return;
      }
      pendingId = toast({ type: "pending", message: t("toast.swapping") });
      const h = await swap({
        tokenIn,
        tokenOut,
        amountInWei: payWei,
        amountOutMinWei,
        path: q.path,
        router,
        to: address,
        mode: isExactOut ? "exactOut" : "exactIn",
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: h,
        timeout: 180_000,
      });
      if (receipt.status !== "success") {
        // On-chain execution reverted — surface as a failure, NOT success.
        // Keep the typed amount so the user can adjust and retry.
        queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
        update(pendingId, { type: "error", message: t("toast.txFailed") });
        return;
      }
      // Swap succeeded — pull the latest balances for both tokens so the UI
      // reflects the new amounts immediately (staleTime is bypassed by invalidate).
      queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
      const meta = getChainMeta(chainId);
      update(pendingId, {
        type: "success",
        message: (
          <a
            href={`${meta?.explorer}/tx/${h}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t("swap.confirmed")} · {t("common.viewExplorer")}
          </a>
        ),
      });
      setTypedValue("");
      setIndependentField("in");
    } catch (e: any) {
      const rejected =
        e?.name === "UserRejectedRequestError" ||
        e?.code === 4001 ||
        /reject/i.test(e?.shortMessage || e?.message || "");
      const msg = rejected
        ? t("toast.rejected")
        : e?.shortMessage || e?.message || t("toast.txFailed");
      if (pendingId) {
        // Flip the lingering "兌換中…" toast into the error/rejection toast
        // (update() auto-dismisses non-pending toasts, so it won't hang).
        update(pendingId, { type: "error", message: msg });
      } else {
        toast({ type: "error", message: msg });
      }
    } finally {
      setBusy(false);
    }
  }

  let buttonLabel = t("swap.title");
  let disabled = false;
  if (!isConnected)
    buttonLabel = connecting ? t("common.connecting") : t("common.connectWallet");
  else if (unsupportedChain) {
    buttonLabel = t("swap.unsupportedChain", {
      chain: chain?.name ?? String(connectedChain),
    });
    disabled = true;
  } else if (!tokenIn || !tokenOut) {
    buttonLabel = t("swap.selectToken");
    disabled = true;
  } else if (!hasAmountInput) {
    buttonLabel = t("swap.enterAmount");
    disabled = true;
  } else if (insufficient) {
    buttonLabel = t("swap.insufficientBalance", { symbol: tokenIn?.symbol ?? "" });
    disabled = true;
  } else if (isFetching) {
    // Quote is refreshing — show a spinner + fetching label instead of a stale
    // action label, and keep the button disabled.
    buttonLabel = t("swap.fetchingQuote");
    disabled = true;
  } else if (!activeQuote) {
    // No trading route for this pair → surface "insufficient liquidity"
    // directly on the button.
    buttonLabel = t("swap.noRoute");
    disabled = true;
  } else if (needsApproval) {
    buttonLabel = t("swap.approve", { symbol: tokenIn.symbol });
  } else if (busy || swapping) {
    buttonLabel = t("swap.confirming");
    disabled = true;
  }

  return (
    <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold">{t("swap.title")}</h2>
        <div className="relative">
          <button
            onClick={() => setShowSettings((s) => !s)}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)]"
            title={t("common.settings")}
          >
            ⚙
          </button>
          {showSettings && (
            <div className="absolute right-0 z-20 mt-2 w-80 animate-fade-up rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-elevated)] p-3 shadow-[var(--card-shadow)]">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--text-muted)]">
                  {t("swap.slippageTolerance")}
                </p>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-[var(--text-muted)] transition hover:text-[var(--text)]"
                  aria-label={t("common.close")}
                >
                  ✕
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => {
                    setAutoSlippage(true);
                    setCustomSlippage("");
                  }}
                  className={clsx(
                    "flex-1 rounded-xl py-2 text-sm font-semibold transition",
                    autoSlippage
                      ? "bg-brand-gradient text-white"
                      : "bg-[var(--input-bg)] hover:bg-[var(--hover)]"
                  )}
                >
                  {t("swap.auto")}
                </button>
                {SLIPPAGE_OPTIONS.map((bps) => (
                  <button
                    key={bps}
                    onClick={() => {
                      setAutoSlippage(false);
                      setSlippageBps(bps);
                      setCustomSlippage("");
                    }}
                    className={clsx(
                      "flex-1 rounded-xl py-2 text-sm font-semibold transition",
                      !autoSlippage && slippageBps === bps
                        ? "bg-brand-gradient text-white"
                        : "bg-[var(--input-bg)] hover:bg-[var(--hover)]"
                    )}
                  >
                    {bps / 100}%
                  </button>
                ))}
                <div
                  className={clsx(
                    "flex h-[34px] items-center rounded-xl px-2 text-sm font-semibold",
                    !autoSlippage &&
                      !SLIPPAGE_OPTIONS.includes(slippageBps)
                      ? "bg-brand-gradient text-white"
                      : "bg-[var(--input-bg)]"
                  )}
                >
                  <input
                    type="number"
                    value={customSlippage}
                    placeholder={(effectiveSlippageBps / 100).toFixed(2)}
                    step="0.1"
                    min="0.1"
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomSlippage(v);
                      const num = parseFloat(v);
                      if (!isNaN(num)) {
                        setAutoSlippage(false);
                        setSlippageBps(Math.round(num * 100));
                      }
                    }}
                    className="no-spinner w-12 bg-transparent text-right text-sm font-semibold outline-none placeholder:text-[var(--text-muted)]"
                  />
                  <span className="ml-0.5">%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {unsupportedChain && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <span aria-hidden>⚠</span>
          <span>
            {t("swap.unsupportedChain", {
              chain: chain?.name ?? String(connectedChain),
            })}
          </span>
        </div>
      )}

      {/* From / Sell */}
      <div className="input-card rounded-2xl p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{t("swap.youPay")}</span>
          {tokenIn && (
            <button onClick={setMax} className="hover:text-[var(--text)]">
              {t("common.balance")} {formatAmount(balanceInNum, tokenIn.decimals)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={payValue}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*\.?\d*$/.test(v)) onTypeIn(v);
            }}
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-[var(--text-muted)]"
          />
          <TokenButton token={tokenIn} onClick={() => setModalSide("in")} />
        </div>
      </div>

      {/* Flip */}
      <div className="relative h-0">
        <button
          onClick={flip}
          className="glass absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl text-lg transition hover:text-brand-soft"
          title={t("swap.flip")}
        >
          ↓
        </button>
      </div>

      {/* To / Buy */}
      <div className="input-card mt-2 rounded-2xl p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{t("swap.youReceive")}</span>
          {tokenOut && balanceOut != null && (
            <button onClick={setMaxOut} className="hover:text-[var(--text)]">
              {t("common.balance")} {formatAmount(balanceOutNum, tokenOut.decimals)}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={receiveValue}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*\.?\d*$/.test(v)) onTypeOut(v);
            }}
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-[var(--text-muted)]"
          />
          <TokenButton token={tokenOut} onClick={() => setModalSide("out")} />
        </div>
      </div>

      <button
        onClick={() => {
          if (!isConnected) {
            connect({ connector: connectors[0] });
            return;
          }
          handleAction();
        }}
        disabled={disabled}
        className="btn-primary mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold"
      >
        {isFetching ? (
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
            {buttonLabel}
          </>
        ) : (
          buttonLabel
        )}
      </button>

      {hasAmountInput && activeQuote && (
        <div className="mt-3 space-y-3">
          {/* Rate + slippage single line, directly below the swap button */}
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <button
              onClick={() => setShowInverseRate((v) => !v)}
              className="flex items-center gap-1 hover:text-[var(--text)]"
            >
              {showInverseRate
                ? `1 ${tokenOut?.symbol} ≈ ${(1 / activeQuote.rate).toFixed(6)} ${tokenIn?.symbol}`
                : `1 ${tokenIn?.symbol} ≈ ${activeQuote.rate.toFixed(6)} ${tokenOut?.symbol}`}
            </button>
            <span>
              {t("swap.slippage")}：
              {autoSlippage
                ? `${t("swap.auto")} ${(effectiveSlippageBps / 100).toFixed(2)}%`
                : `${(effectiveSlippageBps / 100).toFixed(2)}%`}
            </span>
          </div>

          {/* Detail card: minimum received / maximum paid, price impact */}
          <div className="input-card space-y-1.5 rounded-2xl px-3.5 py-3 text-xs">
            <Row
              label={isExactOut ? t("swap.maxPaid") : t("swap.minReceived")}
              value={
                "amountInMax" in activeQuote
                  ? `${formatAmount(activeQuote.amountInMax, tokenIn?.decimals ?? 18)} ${tokenIn?.symbol}`
                  : `${formatAmount(activeQuote.amountOutMin, tokenOut?.decimals ?? 18)} ${tokenOut?.symbol}`
              }
            />
            <Row
              label={t("swap.priceImpact")}
              value={
                activeQuote.priceImpact != null
                  ? `${(activeQuote.priceImpact * 100).toFixed(2)}%`
                  : "—"
              }
            />
          </div>
        </div>
      )}

      <TokenSelectModal
        open={modalSide !== null}
        chainId={chainId}
        address={address}
        exclude={modalSide === "in" ? tokenOut?.address : tokenIn?.address}
        locked={modalSide === "in" ? tokenIn?.address : tokenOut?.address}
        onClose={() => setModalSide(null)}
        onSelect={(tk) => modalSide && onSelect(modalSide, tk)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function TokenButton({
  token,
  onClick,
}: {
  token: SwapToken | undefined;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  if (!token) {
    return (
      <button
        onClick={onClick}
        className="btn-primary shrink-0 rounded-full px-3 py-2 text-sm font-semibold"
      >
        {t("common.select")}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-full bg-[var(--input-bg)] py-1.5 pl-1.5 pr-3 transition hover:bg-[var(--hover)]"
    >
      <TokenLogo token={token} size={26} />
      <span className="text-sm font-semibold">{token.symbol}</span>
      <span className="text-[var(--text-muted)]">▾</span>
    </button>
  );
}
