"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, usePublicClient } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { parseUnits, maxUint256 } from "viem";
import { bsc } from "wagmi/chains";
import { getNativeToken, getTokenByAddress, type SwapToken } from "@/config/tokens";
import { getRouterAddresses, getFactoryAddresses, WNATIVE } from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { recordLiquidityAdded } from "@/lib/recentLiquidity";
import { usePairReserves, balancedOtherSide } from "@/hooks/usePairReserves";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useAddLiquidity } from "@/hooks/useAddLiquidity";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { TokenSelectModal } from "./TokenSelectModal";
import { LiquidityConfirmModal } from "./LiquidityConfirmModal";
import { useTranslation } from "./LanguageProvider";
import { formatAmount, formatBalance } from "@/lib/format";
import { computeMinAmountOut, sqrtBigInt, type Address } from "@/lib/swap";
import { getChainMeta } from "@/config/chains";

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
  const chainId = connectedChain ?? bsc.id;
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
    router.replace(`/liquidity/add?${params.toString()}`, { scroll: false });
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
      const slippage = 50; // 0.5%
      const amtAMin = computeMinAmountOut(weiA, slippage);
      const amtBMin = computeMinAmountOut(weiB, slippage);
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

  // Pool price used by the confirm modal (tokenB per tokenA). Only meaningful
  // for an existing pool; for a brand-new pool the modal hides the rate row.
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
  // Step 2's back arrow returns to Step 1 (preserving the chosen tokens),
  // not the liquidity list.
  const backToStep1 = () => {
    const params = new URLSearchParams();
    params.set("step", "1");
    if (curA) params.set("currencyA", curA);
    if (curB) params.set("currencyB", curB);
    router.push(`/liquidity/add?${params.toString()}`, { scroll: false });
  };

  // ---- Step 1: choose tokens ----
  if (step === 1) {
    const canNext = !!tokenA && !!tokenB;
    return (
      <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-4 sm:p-5">
        <Header step={1} onBack={backToList} title={t("liquidity.title")} />

        <div className="mt-5 rounded-2xl bg-[var(--input-bg)] border border-[var(--border)] p-4">
          <TokenSelectRow
            label={t("liquidity.tokenA")}
            token={tokenA}
            onClick={() => setModalSide("a")}
            placeholder={t("liquidity.selectTokens")}
          />
          <div className="my-3 h-px bg-[var(--border)]" />
          <TokenSelectRow
            label={t("liquidity.tokenB")}
            token={tokenB}
            onClick={() => setModalSide("b")}
            placeholder={t("liquidity.selectTokens")}
          />
        </div>

        <button
          onClick={goStep2}
          disabled={!canNext}
          className="btn-primary mt-5 w-full rounded-full py-4 text-base font-bold disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("liquidity.next")}
        </button>

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
    <div className="glass w-full max-w-md animate-fade-up rounded-3xl p-4 sm:p-5">
      <Header step={2} onBack={backToStep1} title={t("liquidity.title")} />

      <div className="mt-5 rounded-2xl bg-[var(--input-bg)] border border-[var(--border)] p-4">
        <TokenInputRow
          token={tokenA!}
          amount={amountA}
          balance={balA}
          onChange={(v) => {
            setPctA(null);
            onAmountA(v);
          }}
          onPercent={onPercentA}
          activePct={pctA}
        />
        <div className="my-3 h-px bg-[var(--border)]" />
        <TokenInputRow
          token={tokenB!}
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

      {reserves.data && !reserves.data.exists && (
        <p className="mt-4 rounded-2xl bg-[var(--input-bg)] border border-[var(--border)] px-4 py-3 text-xs text-[var(--text-muted)]">
          {t("liquidity.poolNotExists")}
        </p>
      )}

      <button
        onClick={() => setShowConfirm(true)}
        disabled={disabled}
        className="btn-primary mt-5 w-full rounded-full py-4 text-base font-bold"
      >
        {label}
      </button>

      {tokenA && tokenB && (
        <LiquidityConfirmModal
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={onConfirmDispatch}
          tokenA={tokenA}
          tokenB={tokenB}
          amountAValue={formatAmount(weiA, tokenA.decimals)}
          amountBValue={formatAmount(weiB, tokenB.decimals)}
          rate={poolRate}
          slippageBps={50}
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

function Header({
  step,
  onBack,
  title,
}: {
  step: number;
  onBack: () => void;
  title: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onBack}
        aria-label="back"
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text)] transition hover:bg-[var(--hover)]"
      >
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none">
          <path d="M15 5 L8 12 L15 19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h2 className="text-lg font-bold">{title}</h2>
      <span className="rounded-full border border-[#f5c542]/40 bg-[rgba(245,197,66,0.10)] px-3.5 py-1 text-sm font-semibold text-[#f5c542]">
        {step} / 2
      </span>
    </div>
  );
}

function TokenSelectRow({
  label,
  token,
  onClick,
  placeholder,
}: {
  label: string;
  token?: SwapToken;
  onClick: () => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between py-1 text-left"
    >
      <div className="flex items-center gap-3.5">
        {token ? (
          <TokenLogo token={token} size={44} />
        ) : (
          <div
            className="flex shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--text-muted)]/40 bg-[var(--input-bg)]"
            style={{ width: 44, height: 44 }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-[var(--text-muted)]">
              <circle cx="12" cy="12" r="10" strokeWidth="1.5" strokeDasharray="4 3" />
            </svg>
          </div>
        )}
        <div className="leading-tight">
          <div className="mb-0.5 text-xs text-[var(--text-muted)]">{label}</div>
          {token ? (
            <div className="text-base font-bold">{token.symbol}</div>
          ) : (
            <div className="text-base font-semibold text-[var(--text-muted)]">{placeholder}</div>
          )}
        </div>
      </div>
      {/* Always show the dropdown chevron (matching the Swap page's token
          button) so it's clear the row is still tappable to change the token. */}
      <div className="flex h-9 w-9 items-center justify-center text-[var(--text-muted)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </button>
  );
}

function TokenInputRow({
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
  // Percentage quick-fill chips sit above the input and are ALWAYS visible
  // (desktop/tablet only — hidden on mobile). Clicking fills this side with
  // that % of the wallet balance. Typing a manual value does NOT hide them, so
  // the shortcuts stay available for re-balancing at any point.
  const showPercent = balance != null && balance > 0n;
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="flex items-center gap-3.5">
        <TokenLogo token={token} size={44} />
        <div className="leading-tight">
          <div className="text-base font-bold">{token.symbol}</div>
          <div className="text-xs text-[var(--text-muted)] tabular-nums">
            {formatBalance(balance ?? 0n, token.decimals)} {token.symbol}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        {showPercent && (
          <div className="hidden gap-1.5 sm:flex">
            {[25, 50, 75, 100].map((p) => {
              const active = p === activePct;
              return (
                <button
                  key={p}
                  type="button"
                  // Keep these quick-fill chips out of the Tab sequence so
                  // pressing Tab in Token1's input jumps straight to Token2's
                  // input instead of landing on a 25%/50%/75%/100% button.
                  tabIndex={-1}
                  onClick={() => onPercent?.(p)}
                  className={
                    active
                      ? "rounded-full bg-[#f5c542] px-2.5 py-1 text-xs font-semibold text-[#020914] transition hover:brightness-110"
                      : "rounded-full border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)]"
                  }
                >
                  {p}%
                </button>
              );
            })}
          </div>
        )}
        <input
          inputMode="decimal"
          placeholder="0.0"
          value={amount}
          onChange={(e) => /(^\d*\.?\d*$)/.test(e.target.value) && onChange(e.target.value)}
          className="w-40 bg-transparent text-right text-2xl font-bold outline-none placeholder:text-[var(--text-muted)] tabular-nums sm:w-52"
        />
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
