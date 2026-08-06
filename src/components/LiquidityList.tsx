"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { maxUint256 } from "viem";
import { bsc } from "wagmi/chains";
import { useLiquidityPositions, type LiquidityPosition } from "@/hooks/useLiquidityPositions";
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity";
import { useApprove } from "@/hooks/useApprove";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { formatAmount } from "@/lib/format";
import { computeMinAmountOut } from "@/lib/swap";
import { getChainMeta } from "@/config/chains";
import { getLiquidityAddedAt } from "@/lib/recentLiquidity";
import { ERC20_ABI } from "@/config/abis/erc20";
import { getRouterAddresses } from "@/config/contracts";
import { useTranslation } from "./LanguageProvider";

const PCTS = [25, 50, 75, 100];

export function LiquidityList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const chainId = connectedChain ?? bsc.id;
  const { data: positions, isLoading, refetch } = useLiquidityPositions(address, chainId);
  const [removing, setRemoving] = useState<LiquidityPosition | null>(null);

  // Surface pairs the user most-recently added at the top. Positions with a
  // recorded add-time sort newest-first; older positions (added before this
  // tracking existed) keep their natural order below.
  const sortedPositions = useMemo(() => {
    if (!positions) return positions;
    const withTime = positions.map((p) => ({
      p,
      at: getLiquidityAddedAt(chainId, p.pair),
    }));
    withTime.sort((x, y) => {
      if (x.at > 0 && y.at > 0) return y.at - x.at; // newest first
      if (x.at > 0) return -1; // recorded always above unrecorded
      if (y.at > 0) return 1;
      return 0; // keep original order for unrecorded
    });
    return withTime.map((w) => w.p);
  }, [positions, chainId]);

  function AddHeader() {
    return (
      <div className="flex w-full max-w-md items-center justify-between px-1">
        <h2 className="text-lg font-bold">{t("liquidity.yourLiquidity")}</h2>
        <button
          onClick={() => router.push("/liquidity/add?step=1")}
          className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
        >
          + {t("liquidity.add")}
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <>
        <AddHeader />
        <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
          <p className="text-[var(--text-muted)]">{t("liquidity.connectPrompt")}</p>
        </div>
      </>
    );
  }

  if (isLoading) {
    return (
      <>
        <AddHeader />
        <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8">
          <div className="shimmer h-4 w-1/2 rounded bg-[var(--input-bg)]" />
          <div className="shimmer mt-3 h-16 w-full rounded-2xl bg-[var(--input-bg)]" />
        </div>
      </>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <>
        <AddHeader />
        <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
          <p className="text-[var(--text-muted)]">{t("liquidity.noPositions")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <AddHeader />
      <div className="w-full max-w-md space-y-3 animate-fade-up">
        {sortedPositions?.map((p) => (
          <div key={p.pair} className="glass rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  <TokenLogo token={p.tokenA} size={30} />
                  <TokenLogo token={p.tokenB} size={30} />
                </div>
                <span className="font-semibold">
                  {p.tokenA.symbol} / {p.tokenB.symbol}
                </span>
              </div>
              <button
                onClick={() => setRemoving(p)}
                className="rounded-full bg-[var(--input-bg)] px-4 py-1.5 text-sm font-semibold transition hover:bg-[var(--hover)]"
              >
                {t("liquidity.remove")}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <PoolStat token={p.tokenA} amount={p.amountA} />
              <PoolStat token={p.tokenB} amount={p.amountB} />
            </div>
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              {t("liquidity.yourPoolShare")} <span className="font-semibold text-[var(--text)]">{(p.share * 100).toFixed(4)}%</span>
            </div>
          </div>
        ))}

        {removing && (
          <RemoveModal position={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); refetch(); }} chainId={chainId} />
        )}
      </div>
    </>
  );
}

function PoolStat({ token, amount }: { token: LiquidityPosition["tokenA"]; amount: bigint }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-[var(--input-bg)] px-3 py-2">
      <TokenLogo token={token} size={22} />
      <div className="leading-tight">
        <div className="font-semibold">{formatAmount(amount, token.decimals)}</div>
        <div className="text-[11px] text-[var(--text-muted)]">{token.symbol}</div>
      </div>
    </div>
  );
}

function RemoveModal({
  position,
  onClose,
  onDone,
  chainId,
}: {
  position: LiquidityPosition;
  onClose: () => void;
  onDone: () => void;
  chainId: number;
}) {
  const { t } = useTranslation();
  const publicClient = usePublicClient({ chainId });
  const { address: address_ } = useAccount();
  const { toast } = useToast();
  const { approve } = useApprove();
  const { removeLiquidity, isPending } = useRemoveLiquidity();
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close on Escape (unless a transaction is in flight).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  const router = getRouterAddresses(chainId).primary;
  const liquidity = useMemo(
    () => (position.lpBalance * BigInt(pct)) / 100n,
    [position.lpBalance, pct]
  );
  const amtA = useMemo(() => (position.amountA * BigInt(pct)) / 100n, [position.amountA, pct]);
  const amtB = useMemo(() => (position.amountB * BigInt(pct)) / 100n, [position.amountB, pct]);
  const minA = computeMinAmountOut(amtA, 50);
  const minB = computeMinAmountOut(amtB, 50);

  // LP token (the pair contract) needs approval before removal if the router
  // isn't already allowed the full amount. Mirrors the add-liquidity stepwise
  // flow: button reads "授权" until approved, then "移除".
  const [needsApproval, setNeedsApproval] = useState(false);
  useEffect(() => {
    if (!publicClient || !address_ || liquidity <= 0n) return;
    publicClient
      .readContract({
        address: position.pair,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address_, router],
      })
      .then((a) => setNeedsApproval((a as bigint) < liquidity))
      .catch(() => setNeedsApproval(false));
  }, [publicClient, address_, position.pair, router, liquidity]);

  async function handleRemove() {
    if (!publicClient || !address_ || liquidity <= 0n) return;
    setBusy(true);
    try {
      // Step 1: approve the LP token if needed. No bottom toast — the modal
      // button shows an in-modal spinner ("授权中").
      if (needsApproval) {
        await approve(position.pair, router, maxUint256);
        setNeedsApproval(false);
        return;
      }
      // Step 2: remove liquidity. Success surfaces as a top-right notification
      // (matches the Swap / add-liquidity pages); no bottom toast is shown.
      const h = await removeLiquidity({
        tokenA: position.tokenA,
        tokenB: position.tokenB,
        liquidity,
        amountAMin: minA,
        amountBMin: minB,
        to: address_ as `0x${string}`,
        router,
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      const meta = getChainMeta(chainId);
      toast({
        type: "success",
        position: "top-right",
        message: (
          <a href={`${meta?.explorer}/tx/${h}`} target="_blank" rel="noreferrer" className="underline">
            {t("liquidity.removed")} · {t("common.viewExplorer")}
          </a>
        ),
      });
      onDone();
    } catch (e: any) {
      // Wallet rejection or failure: keep the modal open for retry; surface a
      // top-right error instead of a lingering bottom toast.
      toast({
        type: "error",
        position: "top-right",
        message: e?.shortMessage || e?.message || t("toast.txFailed"),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/20 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="glass w-full max-w-md animate-fade-up rounded-t-3xl p-5 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">
            {t("liquidity.removing", { pair: `${position.tokenA.symbol} / ${position.tokenB.symbol}` })}
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)]">
            ✕
          </button>
        </div>

        <div className="mb-4 flex justify-center">
          <div className="flex -space-x-2">
            <TokenLogo token={position.tokenA} size={40} />
            <TokenLogo token={position.tokenB} size={40} />
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-2 text-3xl font-bold text-[#f5c542]">{pct}%</div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
            className="remove-slider"
            style={{ "--pct": `${pct}%` } as React.CSSProperties}
          />
        </div>

        <div className="mb-4 grid grid-cols-4 gap-2">
          {PCTS.map((p) => (
            <button
              key={p}
              onClick={() => setPct(p)}
              className={
                "rounded-xl py-2 text-sm font-semibold transition " +
                (pct === p ? "bg-brand-gradient text-white" : "bg-[var(--input-bg)] hover:bg-[var(--hover)]")
              }
            >
              {p === 100 ? t("common.max") : `${p}%`}
            </button>
          ))}
        </div>

        <div className="mb-4 space-y-2 rounded-2xl bg-[var(--input-bg)] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{position.tokenA.symbol}</span>
            <span className="font-medium">{formatAmount(amtA, position.tokenA.decimals)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{position.tokenB.symbol}</span>
            <span className="font-medium">{formatAmount(amtB, position.tokenB.decimals)}</span>
          </div>
        </div>

        <button
          onClick={handleRemove}
          disabled={busy || isPending || liquidity <= 0n}
          className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-base font-bold disabled:opacity-70"
        >
          {busy ? (
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
                ? t("liquidity.authorizingLp")
                : t("swap.confirmInWallet")}
            </>
          ) : needsApproval ? (
            t("liquidity.authorizeLp")
          ) : (
            t("liquidity.removeConfirm")
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
