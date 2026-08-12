"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, maxUint256 } from "viem";
import clsx from "clsx";
import { getNativeToken, getTokenByAddress, type SwapToken } from "@/config/tokens";
import { getRouterAddresses, getFactoryAddresses, WNATIVE, SWAP_FEE_BPS } from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { recordLiquidityAdded } from "@/lib/recentLiquidity";
import { usePairReserves, balancedOtherSide } from "@/hooks/usePairReserves";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useAddLiquidity } from "@/hooks/useAddLiquidity";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokenPrices } from "@/hooks/useAllPools";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { TokenSelectModal } from "./TokenSelectModal";
import { LiquidityConfirmModal } from "./LiquidityConfirmModal";
import { SlippageSettings, loadSavedSlippage } from "./SlippageSettings";
import { useTranslation } from "./LanguageProvider";
import { formatAmount, formatBalance, formatSlippage, formatUsd, formatNumber } from "@/lib/format";
import { computeMinAmountOut, sqrtBigInt, type Address } from "@/lib/swap";
import { getChainMeta, DEFAULT_CHAIN_ID } from "@/config/chains";

// Map a URL param value ("BNB" for native, an address for ERC20) back to a
// SwapToken for the active chain.
function resolveToken(chainId: number, value?: string | null): SwapToken | undefined {
  if (!value) return undefined;
  const native = getNativeToken(chainId);
  if (value.toLowerCase() === native.symbol.toLowerCase()) return native;
  return getTokenByAddress(chainId, value as Address);
}

function paramValue(t: SwapToken): string {
  return t.isNative ? t.symbol : t.address;
}

export function LiquidityAdd() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const chainId = connectedChain ?? DEFAULT_CHAIN_ID;
  const publicClient = usePublicClient({ chainId });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { approve } = useApprove();
  const { addLiquidity, isPending } = useAddLiquidity();

  const step = searchParams.get("step") === "2" ? 2 : 1;
  const curA = searchParams.get("currencyA");
  const curB = searchParams.get("currencyB");
  // Defaults when no URL param is supplied: neither side is pre-selected, so the
  // user explicitly picks both tokens (Token A no longer defaults to the
  // chain's native coin). A URL param that fails to resolve stays `undefined`
  // (handled by the guard / redirect below).
  const tokenA = curA ? resolveToken(chainId, curA) : undefined;
  const tokenB = curB ? resolveToken(chainId, curB) : undefined;

  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  // Tracks which quick-fill percentage chip is "active" per side, so the
  // clicked one can be highlighted. Manual typing clears it; clicking a chip on
  // one side also clears the other (the opposite side is auto-filled, so it
  // shouldn't carry a stale "clicked" indicator).
  const [pctA, setPctA] = useState<number | null>(null);
  const [pctB, setPctB] = useState<number | null>(null);
  const [modalSide, setModalSide] = useState<"a" | "b" | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // Slippage preference — shared with the Swap card via the same storage key
  // and the same settings popup (SlippageSettings).
  const savedSlippage = useMemo(() => loadSavedSlippage(), []);
  const [slippage, setSlippage] = useState(savedSlippage);
  const effectiveSlippageBps = slippage.auto ? 50 : slippage.bps;

  // Step 2 requires both tokens chosen. If someone lands on ?step=2 without
  // them (e.g. manual URL, or a stale token from another chain), bounce back to
  // step 1. Gated on `isConnected` so we don't redirect during the brief
  // pre-hydration window where `connectedChain` is undefined and tokens can't
  // resolve yet (would otherwise drop a valid testnet URL back to step 1).
  useEffect(() => {
    if (isConnected && step === 2 && (!tokenA || !tokenB)) {
      router.replace("/liquidity/add?step=1", { scroll: false });
    }
  }, [isConnected, step, tokenA, tokenB, router]);

  const reserves = usePairReserves(tokenA, tokenB, chainId);
  const { data: balA } = useTokenBalance(tokenA, address, chainId);
  const { data: balB } = useTokenBalance(tokenB, address, chainId);
  const routerAddr = getRouterAddresses(chainId).primary;
  const allowA = useTokenAllowance(tokenA, address, routerAddr, chainId);
  const allowB = useTokenAllowance(tokenB, address, routerAddr, chainId);
  // USD price of tokenA — used by the step-2 "current price" line's (US$…)
  // suffix. Priced lazily; the suffix simply hides until resolved.
  const priceTokens = useMemo(() => (tokenA ? [tokenA] : []), [tokenA]);
  const { data: priceMap } = useTokenPrices(chainId, priceTokens);

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

  // Fill a side's input with a percentage of its wallet balance. Routing the
  // value through onAmountA/onAmountB keeps the opposite side auto-balanced.
  function onPercentA(pct: number) {
    if (!balA || !tokenA) return;
    const wei = (balA * BigInt(pct)) / 100n;
    setPctA(pct);
    setPctB(null);
    onAmountA(formatAmount(wei, tokenA.decimals));
  }
  function onPercentB(pct: number) {
    if (!balB || !tokenB) return;
    const wei = (balB * BigInt(pct)) / 100n;
    setPctB(pct);
    setPctA(null);
    onAmountB(formatAmount(wei, tokenB.decimals));
  }

  function selectToken(side: "a" | "b", tk: SwapToken, clearOpposite = false) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("step", "1");
    params.set(side === "a" ? "currencyA" : "currencyB", paramValue(tk));
    // When the chosen token is the one already selected on the opposite side,
    // clear that opposite side (a pool can't pair a token with itself) instead
    // of swapping the two. See onSelect below.
    if (clearOpposite) {
      params.delete(side === "a" ? "currencyB" : "currencyA");
    }
    router.replace(`/liquidity/add?${params.toString()}`, { scroll: false });
    setModalSide(null);
  }

  function goStep2() {
    if (!tokenA || !tokenB) return;
    // Entering Step 2 with a fresh pair — clear any stale amounts from a
    // previous attempt so the user starts from an empty input each time.
    setAmountA("");
    setAmountB("");
    setPctA(null);
    setPctB(null);
    const params = new URLSearchParams();
    params.set("step", "2");
    params.set("currencyA", paramValue(tokenA));
    params.set("currencyB", paramValue(tokenB));
    // Use push (not replace) so a distinct history entry is created for step 2.
    // That way the browser's Back button returns to step 1 instead of whatever
    // page preceded the add-liquidity flow.
    router.push(`/liquidity/add?${params.toString()}`, { scroll: false });
  }

  // Reset clears both tokens (and any typed amounts) and lands back on step 1.
  function resetAll() {
    setAmountA("");
    setAmountB("");
    setPctA(null);
    setPctB(null);
    router.replace("/liquidity/add?step=1", { scroll: false });
  }

  // Whether each side still needs an ERC20 approval before it can be pulled
  // into the pool. Native coins never need approval. These drive the confirm
  // modal's stepwise button: 授权 A → 授权 B → 确认添加流动性.
  const needsApprovalA =
    !!tokenA && !tokenA.isNative && weiA > 0n && (allowA.allowance ?? 0n) < weiA;
  const needsApprovalB =
    !!tokenB && !tokenB.isNative && weiB > 0n && (allowB.allowance ?? 0n) < weiB;

  // Approve ONE side's token for the router. Called step-by-step from the
  // confirm modal button. After the receipt lands we refetch that side's
  // allowance so the button flips to the next step (授权 B) automatically.
  async function runApprove(side: "a" | "b") {
    const token = side === "a" ? tokenA : tokenB;
    const wei = side === "a" ? weiA : weiB;
    const allowance = side === "a" ? (allowA.allowance ?? 0n) : (allowB.allowance ?? 0n);
    const refetch = side === "a" ? allowA.refetch : allowB.refetch;
    if (!token || token.isNative || wei <= 0n || allowance >= wei) return;
    setBusy(true);
    try {
      const h = await approve(token.address, routerAddr, maxUint256);
      await publicClient!.waitForTransactionReceipt({ hash: h });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
    } catch {
      // Wallet rejection or failure: swallow. The modal stays open with the
      // button reset, so the user can simply tap the (same) approval again.
    } finally {
      setBusy(false);
    }
  }

  // The final step: actually supply both sides into the pool. Approvals are
  // handled separately by runApprove above, driven by the modal button.
  async function doAddLiquidity() {
    if (!tokenA || !tokenB || !address || !publicClient || weiA <= 0n || weiB <= 0n) return;
    setBusy(true);
    try {
      const slippageBps = effectiveSlippageBps;
      const amtAMin = computeMinAmountOut(weiA, slippageBps);
      const amtBMin = computeMinAmountOut(weiB, slippageBps);
      const h = await addLiquidity({
        tokenA,
        tokenB,
        amountADesired: weiA,
        amountBDesired: weiB,
        amountAMin: amtAMin,
        amountBMin: amtBMin,
        to: address,
        router: routerAddr,
      });
      await publicClient.waitForTransactionReceipt({ hash: h });
      // Remember when this pair was added so the liquidity list can surface it
      // at the top (on-chain positions carry no creation timestamp).
      try {
        const { primary: factory } = getFactoryAddresses(chainId);
        const pa = (tokenA.isNative ? WNATIVE[chainId] : tokenA.address) as Address;
        const pb = (tokenB.isNative ? WNATIVE[chainId] : tokenB.address) as Address;
        const pair = (await publicClient.readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: "getPair",
          args: [pa, pb],
        })) as Address;
        if (pair && pair !== ("0x0000000000000000000000000000000000000000" as Address)) {
          recordLiquidityAdded(chainId, pair);
        }
      } catch {
        /* best-effort; listing order is non-critical */
      }
      // Success surfaces as a top-right notification (matches the Swap page);
      // no bottom toast is shown.
      const meta = getChainMeta(chainId);
      toast({
        type: "success",
        position: "top-right",
        message: (
          <a href={`${meta?.explorer}/tx/${h}`} target="_blank" rel="noreferrer" className="underline">
            {t("liquidity.added")} · {t("common.viewExplorer")}
          </a>
        ),
      });
      setAmountA("");
      setAmountB("");
      setPctA(null);
      setPctB(null);
      queryClient.invalidateQueries({
        queryKey: ["liquidity-positions", chainId, address],
      });
      router.push("/liquidity");
    } catch {
      // Wallet rejection or failure: swallow — the modal stays open for retry.
    } finally {
      setBusy(false);
    }
  }

  // The confirm modal's single action button dispatches the next pending step:
  // approve A, then approve B, then finally add liquidity. Each click performs
  // exactly one on-chain action; the button label reflects the current step.
  function onConfirmDispatch() {
    if (needsApprovalA) {
      runApprove("a");
      return;
    }
    if (needsApprovalB) {
      runApprove("b");
      return;
    }
    doAddLiquidity();
  }

  // LP tokens the user will receive + their resulting pool share, previewed in
  // the confirm modal. For an existing pool we mint min(a·TS/rA, b·TS/rB); for a
  // brand-new pool it's sqrt(amountA·amountB) − MINIMUM_LIQUIDITY (1000 wei).
  const lpInfo = useMemo(() => {
    if (weiA <= 0n || weiB <= 0n) return { lpReceived: "0", shareAfter: 0 };
    const r = reserves.data;
    if (r?.exists && r.token0 && r.totalSupply > 0n && tokenA && tokenB) {
      const aIsToken0 = r.token0.toLowerCase() === tokenA.address.toLowerCase();
      const reserveA = aIsToken0 ? r.reserve0 : r.reserve1;
      const reserveB = aIsToken0 ? r.reserve1 : r.reserve0;
      if (reserveA > 0n && reserveB > 0n) {
        const mintA = (weiA * r.totalSupply) / reserveA;
        const mintB = (weiB * r.totalSupply) / reserveB;
        const minted = mintA < mintB ? mintA : mintB;
        const ts = r.totalSupply;
        const share =
          ts + minted > 0n
            ? Number((minted * 10000n) / (ts + minted)) / 100
            : 0;
        return { lpReceived: formatAmount(minted, 18), shareAfter: share };
      }
    }
    // Brand-new pool: liquidity ≈ sqrt(amountA·amountB) − MINIMUM_LIQUIDITY.
    const minted = sqrtBigInt(weiA * weiB);
    const afterMin = minted > 1000n ? minted - 1000n : 0n;
    return { lpReceived: formatAmount(afterMin, 18), shareAfter: 100 };
  }, [reserves.data, tokenA, tokenB, weiA, weiB]);

  const reserveView = useMemo(() => {
    const r = reserves.data;
    if (!r?.exists || !tokenA || !tokenB || !r.token0) return null;
    const aIsToken0 = r.token0.toLowerCase() === tokenA.address.toLowerCase();
    return {
      a: aIsToken0 ? r.reserve0 : r.reserve1,
      b: aIsToken0 ? r.reserve1 : r.reserve0,
    };
  }, [reserves.data, tokenA, tokenB]);

  // Pool price used by the step-2 header and the confirm modal (tokenB per
  // tokenA). Only meaningful for an existing pool; a brand-new pool shows "—".
  const poolRate = useMemo(() => {
    if (!reserveView || reserveView.a <= 0n) return 0;
    const a = Number(formatAmount(reserveView.a, tokenA!.decimals));
    const b = Number(formatAmount(reserveView.b, tokenB!.decimals));
    if (a <= 0) return 0;
    return b / a;
  }, [reserveView, tokenA, tokenB]);

  // Share of the pool the user will own after this deposit (derived from the
  // LP mint estimate in lpInfo). For a new pool the first depositor owns 100%.
  const shareAfter = lpInfo.shareAfter;
  // Synthesized LP token symbol, e.g. "USDT-BNB LP".
  const lpSymbol =
    tokenA && tokenB ? `${tokenA.symbol}-${tokenB.symbol} LP` : "";

  const backToList = () => router.push("/liquidity");
  // Step 2's edit button returns to Step 1 (preserving the chosen tokens).
  const backToStep1 = () => {
    const params = new URLSearchParams();
    params.set("step", "1");
    if (curA) params.set("currencyA", curA);
    if (curB) params.set("currencyB", curB);
    router.push(`/liquidity/add?${params.toString()}`, { scroll: false });
  };

  const feePct = formatSlippage(SWAP_FEE_BPS);
  const tokenAUsd = tokenA ? priceMap?.get(tokenA.address.toLowerCase()) : undefined;

  const tokenSelectModal = (
    <TokenSelectModal
      open={modalSide !== null}
      chainId={chainId}
      address={address}
      exclude={modalSide === "a" ? tokenB?.address : tokenA?.address}
      locked={modalSide === "a" ? tokenA?.address : tokenB?.address}
      onClose={() => setModalSide(null)}
      onSelect={(tk) => {
        if (modalSide === "a") {
          // Picking the token B already holds → set A to it and clear B.
          selectToken("a", tk, !!tokenB && tk.address === tokenB.address);
        } else {
          // Picking the token A already holds → set B to it and clear A.
          selectToken("b", tk, !!tokenA && tk.address === tokenA.address);
        }
      }}
    />
  );

  const pageHead = (
    <>
      {/* Breadcrumb */}
      <div className="text-[13px] text-white/45">
        <button onClick={backToList} className="transition hover:text-white/80 text-[16px]">
          {t("liquidity.yourPositions")}
        </button>
        <span className="mx-2 text-white/25">›</span>
        <span className="text-white/90 text-[16px]">
          {t("liquidity.newPosition")}
        </span>
      </div>
      {/* Title row: big title + reset + slippage gear */}
      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-[28px] font-bold tracking-[0.01em] sm:text-[34px]">
          {t("liquidity.newPosition")}
        </h1>
        <div className="flex items-center gap-2.5">
          <button
            onClick={resetAll}
            className="flex items-center gap-[7px] rounded-full border border-white/[0.08] bg-[var(--btn-bg)] px-4 py-2 text-[13px] font-semibold text-white/85 transition hover:bg-[#242424]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
            </svg>
            {t("liquidity.reset")}
          </button>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-[var(--btn-bg)]">
            <SlippageSettings value={slippage} onChange={setSlippage} />
          </div>
        </div>
      </div>
    </>
  );

  // ---- Step 1: choose tokens ----
  if (step === 1) {
    const canNext = !!tokenA && !!tokenB;
    return (
      <div className="w-full animate-fade-up">
        {pageHead}
        <div className="mt-7 flex gap-20">
          <StepsRail current={1} className="hidden md:flex" />

          <div className="min-w-0 flex-1 rounded-radius border border-white/[0.06] p-5 sm:p-6">
            <h2 className="text-[17px] font-bold">{t("liquidity.selectPair")}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
              {t("liquidity.selectPairDesc")}
            </p>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <TokenSelectButton token={tokenA} onClick={() => setModalSide("a")} />
              <TokenSelectButton token={tokenB} onClick={() => setModalSide("b")} />
            </div>

            <h2 className="mt-7 text-[17px] font-bold">{t("liquidity.feeTier")}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
              {t("liquidity.feeTierDesc", { fee: feePct })}
            </p>
            <div className="mt-4 rounded-radius border border-white/[0.07] px-[18px] py-[15px]">
              <div className="text-sm font-bold">
                {t("liquidity.feeTierCard", { fee: feePct })}
              </div>
              <div className="mt-[3px] text-xs text-white/40">
                {t("liquidity.feeTierCardSub")}
              </div>
            </div>

            <button
              onClick={goStep2}
              disabled={!canNext}
              className={clsx(
                "mt-6 w-full rounded-radius py-[15px] text-[15px] font-bold transition",
                canNext
                  ? "bg-white text-[#111] hover:bg-white/90"
                  : "cursor-not-allowed bg-[var(--btn-bg)] text-white/35"
              )}
            >
              {t("liquidity.continue")}
            </button>
          </div>
        </div>

        {tokenSelectModal}
      </div>
    );
  }

  // ---- Step 2: input amounts ----
  // Both tokens must be resolved before rendering the amount inputs. While the
  // chain/account is still hydrating (or for a genuinely invalid token), `tokenA`
  // / `tokenB` can be undefined and dereferencing them would crash SSR. Render a
  // blank shell until they resolve — the effect above redirects invalid URLs.
  if (!tokenA || !tokenB) return null;

  let label = t("liquidity.addBtn");
  let disabled = false;
  if (!isConnected) label = t("common.connectWallet");
  else if (weiA <= 0n || weiB <= 0n) {
    label = t("swap.enterAmount");
    disabled = true;
  } else if (tokenA && weiA > (balA ?? 0n)) {
    label = t("swap.insufficientBalance", { symbol: tokenA.symbol });
    disabled = true;
  } else if (tokenB && weiB > (balB ?? 0n)) {
    label = t("swap.insufficientBalance", { symbol: tokenB.symbol });
    disabled = true;
  } else if (busy || isPending) {
    label = t("swap.confirming");
    disabled = true;
  }

  return (
    <div className="w-full animate-fade-up">
      {pageHead}
      <div className="mt-7 flex gap-10">
        <StepsRail current={2} className="hidden md:flex" onStepClick={backToStep1} />

        <div className="min-w-0 flex-1">
          {/* Pair summary card */}
          <div className="rounded-radius border border-white/[0.06] p-5 sm:px-[22px]">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-none -space-x-2.5">
                <TokenLogo token={tokenA} size={34} />
                <TokenLogo token={tokenB} size={34} />
              </div>
              <span className="text-[17px] font-bold">
                {tokenA.symbol} / {tokenB.symbol}
              </span>
              {/* <span className="rounded-md bg-[#2b2b2b] px-[7px] py-[2px] text-[11px] font-semibold text-white/55">
                v2
              </span>
              <span className="rounded-md bg-[#2b2b2b] px-[7px] py-[2px] text-[11px] font-semibold text-white/55">
                {feePct}%
              </span> */}
              <button
                onClick={backToStep1}
                className="ml-auto flex items-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-[var(--btn-bg)] px-3.5 py-2 text-[13px] font-semibold text-white/85 transition hover:bg-[#2c2c2c]"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
                {t("liquidity.edit")}
              </button>
            </div>
            <div className="mt-[3px] text-[15px] font-semibold">
              {poolRate > 0 ? (
                <>
                  <div className="mt-3.5 text-xs text-white/40">{t("liquidity.currentPrice")}</div>
                  {formatNumber(poolRate, 6)} {tokenB.symbol}/{tokenA.symbol}
                  {tokenAUsd != null && (
                    <span className="font-medium text-white/45"> ({formatUsd(tokenAUsd)})</span>
                  )}
                </>
              ) : (
                ""
              )}
            </div>
          </div>

          {/* Deposit card */}
          <div className="mt-4 rounded-radius border border-white/[0.06] p-5 sm:p-6">
            <h2 className="text-[17px] font-bold">{t("liquidity.depositTokens")}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">
              {t("liquidity.depositTokensDesc")}
            </p>

            <div className="mt-4 flex flex-col gap-3.5">
              <AmountCard
                token={tokenA}
                amount={amountA}
                balance={balA}
                onChange={(v) => {
                  setPctA(null);
                  onAmountA(v);
                }}
                onPercent={onPercentA}
                activePct={pctA}
              />
              <AmountCard
                token={tokenB}
                amount={amountB}
                balance={balB}
                onChange={(v) => {
                  setPctB(null);
                  onAmountB(v);
                }}
                onPercent={onPercentB}
                activePct={pctB}
              />
            </div>

            {reserves.isLoading && (
              <p className="mt-4 text-center text-xs text-[var(--text-muted)]">{t("liquidity.checkingPool")}</p>
            )}

            <button
              onClick={() => setShowConfirm(true)}
              disabled={disabled}
              className={clsx(
                "mt-4 w-full rounded-radius py-[15px] text-[15px] font-bold transition",
                disabled
                  ? "cursor-not-allowed bg-[var(--btn-bg)] text-white/35"
                  : "bg-brand-gradient text-[#0b0b14] hover:brightness-110"
              )}
            >
              {label}
            </button>

            {reserves.data && !reserves.data.exists && (
              <p className="mt-4 rounded-radius border border-[var(--border)] bg-[var(--input-bg)] px-4 py-3 text-xs text-[var(--text-muted)]">
                {t("liquidity.poolNotExists")}
              </p>
            )}
          </div>
        </div>
      </div>

      {tokenA && tokenB && (
        <LiquidityConfirmModal
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={onConfirmDispatch}
          tokenA={tokenA}
          tokenB={tokenB}
          amountAValue={formatAmount(weiA, tokenA.decimals)}
          amountBValue={formatAmount(weiB, tokenB.decimals)}
          shareAfter={shareAfter}
          lpReceivedValue={lpInfo.lpReceived}
          lpSymbol={lpSymbol}
          needsApprovalA={needsApprovalA}
          needsApprovalB={needsApprovalB}
          isBusy={busy || isPending}
        />
      )}
    </div>
  );
}

// Left rail listing the two wizard steps with numbered dots. The active step
// gets a filled white dot; a completed/passed step is dimmed but clickable to
// jump back. Desktop only (hidden on mobile via the caller's `hidden md:flex`).
function StepsRail({
  current,
  className = "",
  onStepClick,
}: {
  current: 1 | 2;
  className?: string;
  onStepClick?: (n: 1 | 2) => void;
}) {
  const { t } = useTranslation();
  const steps = [
    { n: 1 as const, label: t("liquidity.step1Label"), title: t("liquidity.step1Title") },
    { n: 2 as const, label: t("liquidity.step2Label"), title: t("liquidity.step2Title") },
  ];
  return (
    <div
      className={clsx(
        "w-[300px] flex-none flex-col self-start border border-white/[0.06] p-5 rounded-radius",
        className
      )}
    >
      {steps.map((s, i) => {
        const active = s.n === current;
        // Steps that come before the current one are finished — let the user
        // click them to go back. The current step itself isn't a link.
        const clickable = !active && onStepClick && s.n < current;
        const content = (
          <>
            <div className="flex flex-col items-center">
              <div
                className={clsx(
                  "flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-sm font-bold",
                  active
                    ? "bg-white text-[#111]"
                    : "bg-[#2b2b2b] text-white"
                )}
              >
                {s.n}
              </div>
              {i < steps.length - 1 && (
                <div className="my-1.5 h-11 w-px bg-white/[0.12]" />
              )}
            </div>
            <div className="pt-1.5">
              <div className="text-xs text-white/40">{s.label}</div>
              <div
                className={clsx(
                  "mt-0.5 text-[15px]",
                  active ? "font-semibold text-white" : "font-medium text-white/55"
                )}
              >
                {s.title}
              </div>
            </div>
          </>
        );
        return clickable ? (
          <button
            key={s.n}
            type="button"
            onClick={() => onStepClick?.(s.n)}
            className="group flex gap-3.5 text-left transition hover:opacity-80 focus:outline-none"
          >
            {content}
          </button>
        ) : (
          <div key={s.n} className="flex gap-3.5">
            {content}
          </div>
        );
      })}
    </div>
  );
}

// Step-1 token picker button. Filled state: dark pill with logo + symbol +
// chevron. Empty state: white pill prompting to choose (matches the mockup).
function TokenSelectButton({ token, onClick }: { token?: SwapToken; onClick: () => void }) {
  const { t } = useTranslation();
  const chevron = (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
  if (token) {
    return (
      <button
        onClick={onClick}
        className="flex flex-1 items-center gap-2.5 rounded-radius border border-white/[0.06] bg-[var(--btn-bg)] px-4 py-[13px] text-[15px] font-bold transition hover:bg-[#242424]"
      >
        <TokenLogo token={token} size={26} />
        {token.symbol}
        <span className="ml-auto text-white/50">{chevron}</span>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex flex-1 items-center justify-between rounded-radius bg-white px-4 py-[13px] text-[15px] font-semibold text-[#111] transition hover:bg-white/90"
    >
      {t("liquidity.selectTokens")}
      <span className="text-black/55">{chevron}</span>
    </button>
  );
}

// Step-2 amount card: big numeric input on the left, token logo + symbol +
// wallet balance on the right. Percentage quick-fill chips sit under the
// balance (desktop only — hidden on mobile). Clicking one fills this side with
// that % of the wallet balance and auto-balances the opposite side.
function AmountCard({
  token,
  amount,
  balance,
  onChange,
  onPercent,
  activePct,
}: {
  token: SwapToken;
  amount: string;
  balance?: bigint;
  onChange: (v: string) => void;
  onPercent?: (pct: number) => void;
  activePct?: number | null;
}) {
  const { t } = useTranslation();
  const showPercent = balance != null && balance > 0n;
  return (
    <div className="group rounded-radius border border-white/[0.05] bg-[var(--btn-bg)] px-[18px] py-5">
      <div className="flex items-center justify-between gap-3">
        <input
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => /(^\d*\.?\d*$)/.test(e.target.value) && onChange(e.target.value)}
          className="w-[55%] bg-transparent text-[28px] font-semibold outline-none placeholder:text-white/35 tabular-nums"
        />
        <div className="flex items-center gap-2 text-[18px] font-bold">
          <TokenLogo token={token} size={28} />
          {token.symbol}
        </div>
      </div>
      {/* Bottom row: percent chips on the left, wallet balance on the right. The balance keeps
          the row's height constant, so fading the chips in on hover never
          changes the card height. Touch devices have no hover — chips stay
          visible there. */}
      <div className="mt-1.5 flex items-center justify-between gap-3">
        {showPercent ? (
          <div
            className={clsx(
              "flex flex-wrap items-center gap-1 transition-opacity duration-200 ease-out",
              "opacity-100",
              "sm:pointer-events-none sm:opacity-0",
              "sm:group-hover:pointer-events-auto sm:group-hover:opacity-100"
            )}
          >
            {[25, 50, 75, 100].map((p) => {
              const active = p === activePct;
              return (
                <button
                  key={p}
                  type="button"
                  // Keep these quick-fill chips out of the Tab sequence so Tab
                  // moves straight from one amount input to the other.
                  tabIndex={-1}
                  onClick={() => onPercent?.(p)}
                  className="rounded-md bg-[#2a2a2a] px-1.5 py-0.5 text-[11px] font-medium text-white transition hover:bg-[#3a3a3a]"
                >
                  {p === 100 ? t("common.max") : `${p}%`}
                </button>
              );
            })}
          </div>
        ) : (
          <span />
        )}
        <div className="text-[14px] text-white/45 tabular-nums">
          {formatBalance(balance ?? 0n, token.decimals)} {token.symbol}
        </div>
      </div>
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
