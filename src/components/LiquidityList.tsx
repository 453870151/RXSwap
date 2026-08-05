"use client";

import { useState, useMemo } from "react";
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
import { ERC20_ABI } from "@/config/abis/erc20";
import { getRouterAddresses } from "@/config/contracts";
import { useTranslation } from "./LanguageProvider";

const PCTS = [25, 50, 75, 100];

export function LiquidityList() {
  const { t } = useTranslation();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const chainId = connectedChain ?? bsc.id;
  const { data: positions, isLoading, refetch } = useLiquidityPositions(address, chainId);
  const [removing, setRemoving] = useState<LiquidityPosition | null>(null);

  if (!isConnected) {
    return (
      <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
        <p className="text-[var(--text-muted)]">{t("liquidity.connectPrompt")}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8">
        <div className="shimmer h-4 w-1/2 rounded bg-[var(--input-bg)]" />
        <div className="shimmer mt-3 h-16 w-full rounded-2xl bg-[var(--input-bg)]" />
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-8 text-center">
        <p className="text-[var(--text-muted)]">
          {t("liquidity.noPositions")}
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-3 animate-fade-up">
      <h2 className="px-1 text-lg font-bold">{t("liquidity.yourLiquidity")}</h2>
      {positions.map((p) => (
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
  const { toast, update } = useToast();
  const { approve } = useApprove();
  const { removeLiquidity, isPending } = useRemoveLiquidity();
  const [pct, setPct] = useState(100);
  const [busy, setBusy] = useState(false);

  const router = getRouterAddresses(chainId).primary;
  const liquidity = useMemo(
    () => (position.lpBalance * BigInt(pct)) / 100n,
    [position.lpBalance, pct]
  );
  const amtA = useMemo(() => (position.amountA * BigInt(pct)) / 100n, [position.amountA, pct]);
  const amtB = useMemo(() => (position.amountB * BigInt(pct)) / 100n, [position.amountB, pct]);
  const minA = computeMinAmountOut(amtA, 50);
  const minB = computeMinAmountOut(amtB, 50);

  async function handleRemove() {
    if (!publicClient || !address_) return;
    setBusy(true);
    try {
      const allowance = (await publicClient.readContract({
        address: position.pair,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address_, router],
      })) as bigint;
      if (allowance < liquidity) {
        const id = toast({ type: "pending", message: t("toast.approveLp") });
        const h = await approve(position.pair, router, maxUint256);
        await publicClient.waitForTransactionReceipt({ hash: h });
        update(id, { type: "success", message: t("toast.lpApproved") });
      }
      const id = toast({ type: "pending", message: t("toast.removePending") });
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
      update(id, {
        type: "success",
        message: (
          <a href={`${meta?.explorer}/tx/${h}`} target="_blank" rel="noreferrer" className="underline">
            {t("liquidity.removed")} · {t("common.viewExplorer")}
          </a>
        ),
      });
      onDone();
    } catch (e: any) {
      toast({ type: "error", message: e?.shortMessage || e?.message || t("toast.txFailed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
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
          className="btn-primary w-full rounded-2xl py-3.5 text-base font-bold"
        >
          {busy || isPending ? t("swap.confirming") : t("liquidity.removeConfirm")}
        </button>
      </div>
    </div>
  );
}
