"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
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
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useSwapWrite } from "@/hooks/useSwapWrite";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { TokenSelectModal } from "./TokenSelectModal";
import { useTranslation } from "./LanguageProvider";
import { formatAmount } from "@/lib/format";
import { getChainMeta } from "@/config/chains";
import type { Address } from "@/lib/swap";

const SLIPPAGE_OPTIONS = [10, 50, 100]; // 0.1% / 0.5% / 1%

export function SwapCard() {
  const { t } = useTranslation();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const chainId = connectedChain ?? bsc.id;
  const publicClient = usePublicClient({ chainId });
  const { toast, update } = useToast();
  const { approve } = useApprove();
  const { swap, isPending: swapping } = useSwapWrite();

  const [tokenIn, setTokenIn] = useState<SwapToken | undefined>();
  const [tokenOut, setTokenOut] = useState<SwapToken | undefined>();
  const [amountIn, setAmountIn] = useState("");
  const [slippageBps, setSlippageBps] = useState(50);
  const [modalSide, setModalSide] = useState<"in" | "out" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [busy, setBusy] = useState(false);

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
  }, [chainId]);

  const amountInWei = useMemo(() => {
    if (!tokenIn || !amountIn) return 0n;
    try {
      return parseUnits(amountIn, tokenIn.decimals);
    } catch {
      return 0n;
    }
  }, [amountIn, tokenIn]);

  const { data: balance } = useTokenBalance(tokenIn, address, chainId);
  const { allowance } = useTokenAllowance(tokenIn, address, tokenIn && getRouterAddresses(chainId).primary, chainId);
  const quote = useSwapQuote({
    tokenIn,
    tokenOut,
    amountIn,
    slippageBps,
    chainId,
  });

  const needsApproval =
    !!tokenIn &&
    !tokenIn.isNative &&
    amountInWei > 0n &&
    allowance < amountInWei;

  const balanceNum = balance ?? 0n;
  const insufficient = amountInWei > balanceNum;

  function flip() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
  }

  function onSelect(side: "in" | "out", t: SwapToken) {
    if (side === "in") {
      if (tokenOut && t.address === tokenOut.address) setTokenOut(undefined);
      setTokenIn(t);
    } else {
      if (tokenIn && t.address === tokenIn.address) setTokenIn(undefined);
      setTokenOut(t);
    }
  }

  function setMax() {
    if (!tokenIn || !balance) return;
    if (tokenIn.isNative) {
      const buffer = parseUnits("0.01", tokenIn.decimals);
      setAmountIn(formatAmount(balance > buffer ? balance - buffer : 0n, tokenIn.decimals));
    } else {
      setAmountIn(formatAmount(balance, tokenIn.decimals));
    }
  }

  async function handleAction() {
    if (!tokenIn || !tokenOut || !address || !publicClient) return;
    if (amountInWei <= 0n) return;
    setBusy(true);
    const router = getRouterAddresses(chainId).primary;
    try {
      if (needsApproval) {
        const id = toast({ type: "pending", message: t("toast.approving", { symbol: tokenIn.symbol }) });
        const h = await approve(tokenIn.address, router, maxUint256);
        await publicClient.waitForTransactionReceipt({ hash: h });
        update(id, { type: "success", message: t("toast.approved", { symbol: tokenIn.symbol }) });
      }
      const q = quote.data;
      if (!q) {
        toast({ type: "error", message: t("swap.noRoute") });
        return;
      }
      const id = toast({ type: "pending", message: t("toast.swapping") });
      const h = await swap({
        tokenIn,
        tokenOut,
        amountInWei,
        amountOutMinWei: q.amountOutMin,
        path: q.path,
        router,
        to: address,
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      const meta = getChainMeta(chainId);
      update(id, {
        type: "success",
        message: (
          <a href={`${meta?.explorer}/tx/${h}`} target="_blank" rel="noreferrer" className="underline">
            {t("swap.confirmed")} · {t("common.viewExplorer")}
          </a>
        ),
      });
      setAmountIn("");
    } catch (e: any) {
      toast({
        type: "error",
        message: e?.shortMessage || e?.message || t("toast.txFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  const amountOutStr = quote.data
    ? formatAmount(quote.data.amountOut, tokenOut?.decimals ?? 18)
    : "";
  const minOutStr = quote.data
    ? formatAmount(quote.data.amountOutMin, tokenOut?.decimals ?? 18)
    : "";

  let buttonLabel = t("swap.title");
  let disabled = false;
  if (!isConnected) buttonLabel = t("common.connectWallet");
  else if (!tokenIn || !tokenOut) {
    buttonLabel = t("swap.selectToken");
    disabled = true;
  } else if (amountInWei <= 0n) {
    buttonLabel = t("swap.enterAmount");
    disabled = true;
  } else if (insufficient) {
    buttonLabel = t("swap.insufficientBalance");
    disabled = true;
  } else if (quote.isFetching) {
    buttonLabel = t("swap.fetchingQuote");
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
            <div className="glass absolute right-0 z-20 mt-2 w-56 animate-fade-up rounded-2xl p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--text-muted)]">
                {t("swap.slippageTolerance")}
              </p>
              <div className="flex gap-1.5">
                {SLIPPAGE_OPTIONS.map((bps) => (
                  <button
                    key={bps}
                    onClick={() => setSlippageBps(bps)}
                    className={clsx(
                      "flex-1 rounded-xl py-1.5 text-xs font-semibold transition",
                      slippageBps === bps
                        ? "bg-brand-gradient text-white"
                        : "bg-[var(--input-bg)] hover:bg-[var(--hover)]"
                    )}
                  >
                    {bps / 100}%
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={slippageBps / 100}
                step="0.1"
                min="0.1"
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) setSlippageBps(Math.round(v * 100));
                }}
                className="input-card mt-2 w-full rounded-xl px-3 py-2 text-sm outline-none"
              />
            </div>
          )}
        </div>
      </div>

      {/* From */}
      <div className="input-card rounded-2xl p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{t("swap.youPay")}</span>
          {tokenIn && (
            <button onClick={setMax} className="hover:text-[var(--text)]">
              {t("common.balance")} {formatAmount(balanceNum, tokenIn.decimals)}{" "}
              <span className="text-brand-soft">{t("common.max")}</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountIn}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*\.?\d*$/.test(v)) setAmountIn(v);
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
          className="glass absolute left-1/2 top-1/2 z-10 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl text-lg transition hover:rotate-180 hover:text-brand-soft"
          title={t("swap.flip")}
        >
          ↓
        </button>
      </div>

      {/* To */}
      <div className="input-card mt-2 rounded-2xl p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{t("swap.youReceive")}</span>
        </div>
        <div className="flex items-center gap-2">
          <input
            readOnly
            placeholder="0.0"
            value={amountOutStr}
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-[var(--text-muted)]"
          />
          <TokenButton token={tokenOut} onClick={() => setModalSide("out")} />
        </div>
      </div>

      {/* Details */}
      {quote.data && amountInWei > 0n && (
        <div className="mt-3 space-y-1.5 rounded-2xl bg-[var(--input-bg)] px-3 py-2.5 text-xs">
          <Row label={t("swap.rate")}>
            1 {tokenIn?.symbol} ≈ {quote.data.rate.toFixed(6)} {tokenOut?.symbol}
          </Row>
          <Row label={t("swap.minReceived")}>{minOutStr} {tokenOut?.symbol}</Row>
          {quote.data.priceImpact !== undefined && (
            <Row label={t("swap.priceImpact")}>
              <span
                className={clsx(
                  quote.data.priceImpact > 0.05
                    ? "text-red-400"
                    : quote.data.priceImpact > 0.01
                    ? "text-amber-400"
                    : "text-emerald-400"
                )}
              >
                {(quote.data.priceImpact * 100).toFixed(2)}%
              </span>
            </Row>
          )}
          <Row label={t("swap.slippage")}>{slippageBps / 100}%</Row>
        </div>
      )}

      <button
        onClick={handleAction}
        disabled={disabled}
        className="btn-primary mt-4 w-full rounded-2xl py-3.5 text-base font-bold"
      >
        {buttonLabel}
      </button>

      <TokenSelectModal
        open={modalSide !== null}
        chainId={chainId}
        exclude={modalSide === "in" ? tokenOut?.address : tokenIn?.address}
        onClose={() => setModalSide(null)}
        onSelect={(t) => modalSide && onSelect(modalSide, t)}
      />
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
