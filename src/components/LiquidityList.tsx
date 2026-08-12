"use client";

import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, usePublicClient } from "wagmi";
import { maxUint256 } from "viem";
import { useLiquidityPositions, type LiquidityPosition } from "@/hooks/useLiquidityPositions";
import { useTokenPrices } from "@/hooks/useAllPools";
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity";
import { useApprove } from "@/hooks/useApprove";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { formatAmount, formatUsd, formatSlippage } from "@/lib/format";
import { computeMinAmountOut } from "@/lib/swap";
import { getChainMeta, DEFAULT_CHAIN_ID } from "@/config/chains";
import { getLiquidityAddedAt } from "@/lib/recentLiquidity";
import { ERC20_ABI } from "@/config/abis/erc20";
import { getRouterAddresses, WNATIVE, SWAP_FEE_BPS } from "@/config/contracts";
import { formatUnits } from "viem";
import { type SwapToken, getNativeToken } from "@/config/tokens";
import { useTranslation } from "./LanguageProvider";

const PCTS = [25, 50, 75, 100];

export function LiquidityList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = connectedChain ?? DEFAULT_CHAIN_ID;

  const [removing, setRemoving] = useState<LiquidityPosition | null>(null);

  const { data: positions, isLoading: mineLoading, refetch } = useLiquidityPositions(address, chainId);

  // Unique tokens across the user's positions — priced in parallel once, so the
  // "My Positions" USD values paint with the positions and "pop in" afterwards.
  const positionTokens = useMemo(() => {
    if (!positions) return [];
    const m = new Map<string, SwapToken>();
    for (const p of positions) {
      m.set(p.tokenA.address.toLowerCase(), p.tokenA);
      m.set(p.tokenB.address.toLowerCase(), p.tokenB);
    }
    return [...m.values()];
  }, [positions]);
  const { data: positionPriceMap } = useTokenPrices(chainId, positionTokens);

  // Navigate to the add-liquidity flow with a preselected pair. If no wallet is
  // connected, connect first (same as the nav button) — the user can then click
  // the add button again to actually land on the add page.
  // A position's pair is always reported as WBNB on-chain. When pre-selecting
  // that pair on the add page we want it to read as the native "BNB" (matching
  // the swap/page convention) rather than the wrapped contract. Map a token to
  // its URL-param value: native → symbol, wrapped-native → symbol too, ERC20 →
  // address.
  function currencyParam(chainId: number, token: SwapToken): string {
    if (token.isNative) return token.symbol;
    const wrapped = WNATIVE[chainId];
    if (wrapped && token.address.toLowerCase() === wrapped.toLowerCase()) return getNativeToken(chainId).symbol;
    return token.address;
  }

  function goAddPair(tokenA: SwapToken, tokenB: SwapToken) {
    if (!isConnected) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    const params = new URLSearchParams();
    params.set("step", "1");
    params.set("currencyA", currencyParam(chainId, tokenA));
    params.set("currencyB", currencyParam(chainId, tokenB));
    router.push(`/liquidity/add?${params.toString()}`);
  }

  // Generic "add liquidity" entry point (no pair): connect if needed, else go.
  function goAdd() {
    if (!isConnected) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    router.push("/liquidity/add?step=1");
  }

  // Preselect a position's pair on the add page.
  function goAddFor(p: LiquidityPosition) {
    goAddPair(p.tokenA, p.tokenB);
  }

  return (
    <>
      <MineView
        isConnected={isConnected}
        isLoading={mineLoading}
        positions={positions}
        priceMap={positionPriceMap}
        chainId={chainId}
        onAdd={goAdd}
        onAddFor={goAddFor}
        onRemove={setRemoving}
        removing={removing}
        onDone={() => {
          setRemoving(null);
          refetch();
        }}
      />
    </>
  );
}

// USD value of the user's holdings in a position. Return contract:
//   undefined → prices still loading (card shows a shimmer)
//   null      → a component token has no on-chain route (card shows "—")
//   number    → resolved USD value.
function positionValueUsd(
  p: LiquidityPosition,
  priceMap: Map<string, number | null> | undefined
): number | null | undefined {
  if (!priceMap) return undefined;
  const pa = priceMap.get(p.tokenA.address.toLowerCase());
  const pb = priceMap.get(p.tokenB.address.toLowerCase());
  if (pa === undefined || pb === undefined) return undefined;
  if (pa === null || pb === null) return null;
  const amtA = Number(formatUnits(p.amountA, p.tokenA.decimals));
  const amtB = Number(formatUnits(p.amountB, p.tokenB.decimals));
  return amtA * pa + amtB * pb;
}

// Pool share as a percentage string: "100%" when effectively the whole pool,
// two decimals for normal shares, "<0.01%" for dust.
function formatSharePct(share: number): string {
  const pct = share * 100;
  if (pct >= 99.95) return "100%";
  if (pct < 0.01) return "<0.01%";
  return `${pct.toFixed(2)}%`;
}

// "My Positions" tab: the previous page, now scoped to this tab. Shows the
// connect prompt (with quick-start guide) when no wallet is connected.
function MineView({
  isConnected,
  isLoading,
  positions,
  priceMap,
  chainId,
  onAdd,
  onAddFor,
  onRemove,
  removing,
  onDone,
}: {
  isConnected: boolean;
  isLoading: boolean;
  positions: LiquidityPosition[] | undefined;
  priceMap: Map<string, number | null> | undefined;
  chainId: number;
  onAdd: () => void;
  onAddFor: (p: LiquidityPosition) => void;
  onRemove: (p: LiquidityPosition | null) => void;
  removing: LiquidityPosition | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();

  // Surface pairs the user most-recently added at the top. Positions with a
  // recorded add-time sort newest-first; older positions keep natural order.
  const sortedPositions = useMemo(() => {
    if (!positions) return positions;
    const withTime = positions.map((p) => ({
      p,
      at: getLiquidityAddedAt(chainId, p.pair),
    }));
    withTime.sort((x, y) => {
      if (x.at > 0 && y.at > 0) return y.at - x.at;
      if (x.at > 0) return -1;
      if (y.at > 0) return 1;
      return 0;
    });
    return withTime.map((w) => w.p);
  }, [positions, chainId]);

  if (!isConnected) {
    return (
      <div className="grid w-full max-w-6xl grid-cols-1 gap-4 animate-fade-up lg:grid-cols-2">
        <ConnectPrompt />
        <QuickStartGuide />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="w-full max-w-6xl animate-fade-up p-8 border border-[rgba(255,255,255,0.12)] rounded-radius"
      >
        <div className="shimmer h-4 w-1/2 rounded bg-[var(--input-bg)]" />
        <div className="shimmer mt-3 h-16 w-full rounded-2xl bg-[var(--input-bg)]" />
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="w-full max-w-6xl animate-fade-up">
        <AddPlaceholder
          onClick={onAdd}
          title={t("liquidity.emptyTitle")}
          hint={t("liquidity.emptyHint")}
        />
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-6xl animate-fade-up flex-col gap-3">
      {/* Header: title on the left, add-liquidity entry on the right. */}
      <div className="flex items-center justify-between px-1 pb-1">
        <h2 className="text-lg font-bold sm:text-xl">{t("liquidity.yourPositions")}</h2>
        <button
          onClick={onAdd}
          className="btn-primary px-4 py-2 text-[13px] font-bold sm:px-[22px] sm:py-[9px] sm:text-sm rounded-radius"
        >
          {t("liquidity.add")}
        </button>
      </div>

      {sortedPositions?.map((p) => {
        // USD value of the user's holdings, derived from the parallel price map.
        // undefined → prices still loading (skeleton), null → no route ("—").
        const valueUsd = positionValueUsd(p, priceMap);
        return (
        <div
          key={p.pair}
          className="flex flex-col gap-4 p-4 transition border border-[rgba(255,255,255,0.12)] sm:flex-row sm:items-center sm:gap-5 sm:p-6 bg-[var(--liquidity-bg)] rounded-radius"
        >
          {/* Left: overlapping logos + pair name / badges / status */}
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex flex-none -space-x-3">
              <TokenLogo token={p.tokenA} size={40} />
              <TokenLogo token={p.tokenB} size={40} />
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold sm:text-lg">
                  {p.tokenA.symbol} / {p.tokenB.symbol}
                </span>
                {/* <span className="rounded-md bg-[#2b2b2b] px-[7px] py-[2px] text-[11px] font-semibold text-white/55">
                  V2
                </span>
                <span className="rounded-md bg-[#2b2b2b] px-[7px] py-[2px] text-[11px] font-semibold text-white/55">
                  {formatSlippage(SWAP_FEE_BPS)}%
                </span> */}
              </div>
              <div className="text-[13px] text-white/45">
                {t("liquidity.deposited")}{" "}
                <span className="font-semibold text-white/90">
                  {formatAmount(p.amountA, p.tokenA.decimals)}
                </span>{" "}
                {p.tokenA.symbol} +{" "}
                <span className="font-semibold text-white/90">
                  {formatAmount(p.amountB, p.tokenB.decimals)}
                </span>{" "}
                {p.tokenB.symbol}
              </div>
            </div>
          </div>

          {/* Right: USD value / pool share metrics + actions */}
          <div className="flex flex-col gap-4 border-t border-white/[0.06] pt-4 sm:ml-auto sm:flex-row sm:items-center sm:gap-7 sm:border-0 sm:pt-0">
            <div className="flex justify-between gap-7 sm:justify-start">
              <div className="sm:text-right">
                {valueUsd === undefined ? (
                  <div className="shimmer h-5 w-16 rounded bg-[var(--input-bg)]" />
                ) : (
                  <div className="text-[17px] font-semibold">
                    {valueUsd != null ? formatUsd(valueUsd) : "—"}
                  </div>
                )}
                <div className="mt-[3px] text-xs text-white/45">
                  {t("liquidity.position")}
                </div>
              </div>
              <div className="sm:text-right">
                <div className="text-[17px] font-semibold">
                  {formatSharePct(p.share)}
                </div>
                <div className="mt-[3px] text-xs text-white/45">
                  {t("liquidity.share")}
                </div>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => onRemove(p)}
                className="flex-1 border border-white/[0.14] px-[22px] py-[9px] text-sm font-bold text-white/75 transition hover:bg-white/5 sm:flex-none rounded-radius"
              >
                {t("liquidity.remove")}
              </button>
              <button
                onClick={() => onAddFor(p)}
                className="btn-primary flex-1 px-[22px] py-[9px] text-sm font-bold sm:flex-none rounded-radius"
              >
                {t("liquidity.addBtn")}
              </button>
            </div>
          </div>
        </div>
        );
      })}

      {removing && (
        <RemoveModal
          position={removing}
          onClose={() => onRemove(null)}
          onDone={onDone}
          chainId={chainId}
        />
      )}
    </div>
  );
}

// Dashed "add liquidity" placeholder card. Used as the empty state (no
// positions) and appended to the positions grid as a quick-add entry.
// `onClick` overrides the default navigation (e.g. to gate on wallet connect).
function AddPlaceholder({ className = "", onClick, compact = false, title, hint }: { className?: string; onClick?: () => void; compact?: boolean; title?: string; hint?: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const handleClick = onClick ?? (() => router.push("/liquidity/add?step=1"));
  const label = title ?? t("liquidity.addNew");
  const sub = hint ?? t("liquidity.addNewHint");
  if (compact) {
    // Horizontal dashed bar used at the end of the position row stack.
    return (
      <button
        onClick={handleClick}
        className={
          "flex w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed border-[rgba(232,185,35,0.35)] bg-[var(--liquidity-bg)] px-5 py-4 text-center hover:border-[rgba(232,185,35,0.65)] hover:bg-[rgba(232,185,35,0.07)] " +
          className
        }
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-base font-light text-[#0b0b14] shadow-glow">
          +
        </span>
        <span className="text-sm font-bold">{label}</span>
        <span className="text-xs text-[var(--text-muted)]">{sub}</span>
      </button>
    );
  }
  return (
    <button
      onClick={handleClick}
      className={
        "flex min-h-[180px] w-full flex-col items-center justify-center gap-2 border border-[rgba(255,255,255,0.12)] p-5 text-center transition rounded-radius" +
        className
      }
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-gradient text-2xl font-light text-[#0b0b14] shadow-glow">
        +
      </span>
      <span className="text-sm font-bold">{label}</span>
      <span className="text-xs text-[var(--text-muted)]">{sub}</span>
    </button>
  );
}

// "Quick start" 3-step guide shown beside the add placeholder on the empty state.
function QuickStartGuide() {
  const { t } = useTranslation();
  const steps = [
    { title: t("liquidity.qs1Title"), desc: t("liquidity.qs1Desc") },
    { title: t("liquidity.qs2Title"), desc: t("liquidity.qs2Desc") },
    { title: t("liquidity.qs3Title"), desc: t("liquidity.qs3Desc") },
  ];
  return (
    <div className="glass p-6 !bg-transparent rounded-radius">
      <h4 className="text-sm font-bold">{t("liquidity.quickStart")}</h4>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{t("liquidity.quickStartHint")}</p>
      <div className="mt-4">
        {steps.map((s, i) => (
          <div
            key={i}
            className="flex gap-3.5 border-t border-[rgba(255,255,255,0.05)] py-3 first:border-t-0 first:pt-0 last:pb-0"
          >
            <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border border-[rgba(232,185,35,0.4)] bg-[var(--input-bg)] text-[13px] font-bold text-[#f5c542]">
              {i + 1}
            </span>
            <div>
              <div className="text-sm font-semibold">{s.title}</div>
              <div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">{s.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Centered "connect wallet" empty state shown inside the "My Positions" tab when
// no wallet is connected.
function ConnectPrompt() {
  const { t } = useTranslation();
  const { connect, connectors, isPending } = useConnect();
  return (
    <div className="glass flex h-full w-full flex-col items-center justify-center px-6 py-16 text-center !bg-transparent rounded-radius">
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <div
          className="absolute -inset-3 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(232,185,35,0.28), transparent 65%)" }}
        />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-brand-gradient shadow-glow">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#0b0b14"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M20 7H5a2 2 0 0 1 0-4h13v4" />
            <path d="M3 5v13a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1" />
            <circle cx="16.5" cy="13.5" r="1.3" fill="#0b0b14" stroke="none" />
          </svg>
        </div>
      </div>
      <h3 className="text-lg font-bold">{t("liquidity.connectTitle")}</h3>
      <p className="mt-2 text-sm text-[var(--text-muted)]">{t("liquidity.connectPrompt")}</p>
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="btn-primary mt-7 px-8 py-3 text-sm font-bold rounded-radius"
      >
        {isPending ? t("common.connecting") : t("common.connectWallet")}
      </button>
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/20 p-0 sm:items-center sm:p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="glass w-full max-w-md animate-fade-up rounded-t-3xl p-5 sm:rounded-3xl bg-[var(--modal-bg)]"
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
                (pct === p ? "bg-brand-gradient text-white" : "bg-[var(--modal-group-bg)]")
              }
            >
              {p === 100 ? t("common.max") : `${p}%`}
            </button>
          ))}
        </div>

        <div className="mb-4 space-y-2 rounded-2xl bg-[var(--modal-group-bg)] p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)] font-bold">{position.tokenA.symbol}</span>
            <span className="font-medium">{formatAmount(amtA, position.tokenA.decimals)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--text-muted)] font-bold">{position.tokenB.symbol}</span>
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
