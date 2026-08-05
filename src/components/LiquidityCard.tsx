"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import clsx from "clsx";
import { bsc } from "wagmi/chains";
import { getTokenList, getNativeToken, getTokenByAddress, type SwapToken } from "@/config/tokens";
import { getRouterAddresses } from "@/config/contracts";
import { usePairReserves, balancedOtherSide } from "@/hooks/usePairReserves";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useAddLiquidity } from "@/hooks/useAddLiquidity";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { TokenSelectModal } from "./TokenSelectModal";
import { useTranslation } from "./LanguageProvider";
import { formatAmount, formatNumber } from "@/lib/format";
import { computeMinAmountOut } from "@/lib/swap";
import { getChainMeta } from "@/config/chains";

export function LiquidityCard() {
  const { t } = useTranslation();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const chainId = connectedChain ?? bsc.id;
  const publicClient = usePublicClient({ chainId });
  const { toast, update } = useToast();
  const { approve } = useApprove();
  const { addLiquidity, isPending } = useAddLiquidity();

  const [tokenA, setTokenA] = useState<SwapToken | undefined>();
  const [tokenB, setTokenB] = useState<SwapToken | undefined>();
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [modalSide, setModalSide] = useState<"a" | "b" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const list = getTokenList(chainId);
    setTokenA((prev) =>
      prev && getTokenByAddress(chainId, prev.address) ? prev : getNativeToken(chainId)
    );
    setTokenB((prev) => {
      if (prev && getTokenByAddress(chainId, prev.address)) return prev;
      return list.find((t) => !t.isNative) ?? list[0];
    });
  }, [chainId]);

  const reserves = usePairReserves(tokenA, tokenB, chainId);
  const { data: balA } = useTokenBalance(tokenA, address, chainId);
  const { data: balB } = useTokenBalance(tokenB, address, chainId);
  const router = getRouterAddresses(chainId).primary;
  const allowA = useTokenAllowance(tokenA, address, router, chainId);
  const allowB = useTokenAllowance(tokenB, address, router, chainId);

  const weiA = useMemo(() => safeParse(amountA, tokenA?.decimals), [amountA, tokenA]);
  const weiB = useMemo(() => safeParse(amountB, tokenB?.decimals), [amountB, tokenB]);

  function onAmountA(v: string) {
    setAmountA(v);
    if (reserves.data?.exists && tokenA && tokenB) {
      const other = balancedOtherSide(v, tokenA, tokenB, reserves.data);
      setAmountB(other ? formatAmount(BigInt(other), tokenB.decimals) : "");
    }
  }
  function onAmountB(v: string) {
    setAmountB(v);
    if (reserves.data?.exists && tokenA && tokenB) {
      const other = balancedOtherSide(v, tokenB, tokenA, reserves.data);
      setAmountA(other ? formatAmount(BigInt(other), tokenA.decimals) : "");
    }
  }

  async function ensureApproval(token: SwapToken | undefined, wei: bigint, allowance: bigint) {
    if (!token || token.isNative || wei <= 0n || allowance >= wei) return;
    const id = toast({ type: "pending", message: t("toast.approving", { symbol: token.symbol }) });
    const h = await approve(token.address, router, maxUint256);
    await publicClient!.waitForTransactionReceipt({ hash: h });
    update(id, { type: "success", message: t("toast.approved", { symbol: token.symbol }) });
  }

  async function handleAdd() {
    if (!tokenA || !tokenB || !address || !publicClient || weiA <= 0n || weiB <= 0n)
      return;
    setBusy(true);
    try {
      await ensureApproval(tokenA, weiA, allowA.allowance);
      await ensureApproval(tokenB, weiB, allowB.allowance);

      const slippage = 50; // 0.5%
      const amtAMin = computeMinAmountOut(weiA, slippage);
      const amtBMin = computeMinAmountOut(weiB, slippage);
      const id = toast({ type: "pending", message: t("toast.addPending") });
      const h = await addLiquidity({
        tokenA,
        tokenB,
        amountADesired: weiA,
        amountBDesired: weiB,
        amountAMin: amtAMin,
        amountBMin: amtBMin,
        to: address,
        router,
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      const meta = getChainMeta(chainId);
      update(id, {
        type: "success",
        message: (
          <a href={`${meta?.explorer}/tx/${h}`} target="_blank" rel="noreferrer" className="underline">
            {t("liquidity.added")} · {t("common.viewExplorer")}
          </a>
        ),
      });
      setAmountA("");
      setAmountB("");
      reserves.refetch();
    } catch (e: any) {
      toast({ type: "error", message: e?.shortMessage || e?.message || t("toast.txFailed") });
    } finally {
      setBusy(false);
    }
  }

  const poolPct = useMemo(() => {
    const r = reserves.data;
    if (!r?.exists || !tokenA || weiA <= 0n || !r.token0) return 0;
    const inIsToken0 = r.token0.toLowerCase() === tokenA.address.toLowerCase();
    const reserveA = inIsToken0 ? r.reserve0 : r.reserve1;
    if (reserveA <= 0n) return 0;
    return Number((weiA * 10000n) / (reserveA + weiA)) / 10000;
  }, [reserves.data, tokenA, weiA]);

  // Align displayed reserves with the pool's on-chain token0/token1 ordering.
  const reserveView = useMemo(() => {
    const r = reserves.data;
    if (!r?.exists || !tokenA || !tokenB || !r.token0) return null;
    const aIsToken0 = r.token0.toLowerCase() === tokenA.address.toLowerCase();
    return {
      a: aIsToken0 ? r.reserve0 : r.reserve1,
      b: aIsToken0 ? r.reserve1 : r.reserve0,
    };
  }, [reserves.data, tokenA, tokenB]);

  let label = t("liquidity.add");
  let disabled = false;
  if (!isConnected) label = t("common.connectWallet");
  else if (!tokenA || !tokenB) {
    label = t("liquidity.selectTokens");
    disabled = true;
  } else if (weiA <= 0n || weiB <= 0n) {
    label = t("swap.enterAmount");
    disabled = true;
  } else if ((tokenA && weiA > (balA ?? 0n)) || (tokenB && weiB > (balB ?? 0n))) {
    label = t("swap.insufficientBalance");
    disabled = true;
  } else if (busy || isPending) {
    label = t("swap.confirming");
    disabled = true;
  }

  return (
    <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-4 sm:p-5">
      <h2 className="mb-3 text-lg font-bold">{t("liquidity.title")}</h2>

      <div className="input-card rounded-2xl p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{t("liquidity.tokenA")}</span>
          {tokenA && (
            <span>{t("common.balance")} {formatAmount(balA ?? 0n, tokenA.decimals)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountA}
            onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onAmountA(e.target.value)}
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-[var(--text-muted)]"
          />
          <TokenButton token={tokenA} onClick={() => setModalSide("a")} />
        </div>
      </div>

      <div className="my-2 text-center text-[var(--text-muted)]">+</div>

      <div className="input-card rounded-2xl p-3.5">
        <div className="mb-1 flex items-center justify-between text-xs text-[var(--text-muted)]">
          <span>{t("liquidity.tokenB")}</span>
          {tokenB && (
            <span>{t("common.balance")} {formatAmount(balB ?? 0n, tokenB.decimals)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            inputMode="decimal"
            placeholder="0.0"
            value={amountB}
            onChange={(e) => /^\d*\.?\d*$/.test(e.target.value) && onAmountB(e.target.value)}
            className="w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-[var(--text-muted)]"
          />
          <TokenButton token={tokenB} onClick={() => setModalSide("b")} />
        </div>
      </div>

      {reserves.isLoading && (
        <p className="mt-3 text-center text-xs text-[var(--text-muted)]">{t("liquidity.checkingPool")}</p>
      )}
      {reserves.data?.exists && reserveView && tokenA && tokenB && (
        <div className="mt-3 rounded-2xl bg-[var(--input-bg)] px-3 py-2.5 text-xs">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t("liquidity.poolReserves")}</span>
            <span className="font-medium">
              {formatAmount(reserveView.a, tokenA.decimals)} {tokenA.symbol} /{" "}
              {formatAmount(reserveView.b, tokenB.decimals)} {tokenB.symbol}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)]">{t("liquidity.yourShareAfter")}</span>
            <span className="font-medium">{formatNumber(poolPct * 100, 4)}%</span>
          </div>
        </div>
      )}
      {reserves.data && !reserves.data.exists && (
        <p className="mt-3 rounded-2xl bg-[var(--input-bg)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
          {t("liquidity.poolNotExists")}
        </p>
      )}

      <button
        onClick={handleAdd}
        disabled={disabled}
        className="btn-primary mt-4 w-full rounded-2xl py-3.5 text-base font-bold"
      >
        {label}
      </button>

      <TokenSelectModal
        open={modalSide !== null}
        chainId={chainId}
        exclude={modalSide === "a" ? tokenB?.address : tokenA?.address}
        onClose={() => setModalSide(null)}
        onSelect={(t) => {
          if (modalSide === "a") {
            if (tokenB && t.address === tokenB.address) setTokenB(undefined);
            setTokenA(t);
          } else {
            if (tokenA && t.address === tokenA.address) setTokenA(undefined);
            setTokenB(t);
          }
        }}
      />
    </div>
  );
}

function safeParse(v: string, decimals?: number): bigint {
  if (!v || decimals === undefined) return 0n;
  try {
    return parseUnits(v, decimals);
  } catch {
    return 0n;
  }
}

function TokenButton({ token, onClick }: { token: SwapToken | undefined; onClick: () => void }) {
  const { t } = useTranslation();
  if (!token)
    return (
      <button onClick={onClick} className="btn-primary shrink-0 rounded-full px-3 py-2 text-sm font-semibold">
        {t("common.select")}
      </button>
    );
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
