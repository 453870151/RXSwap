"use client";

import { useState, useMemo, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useAccount, useConnect, usePublicClient } from "wagmi";
import { maxUint256 } from "viem";
import { bsc } from "wagmi/chains";
import { useLiquidityPositions, type LiquidityPosition } from "@/hooks/useLiquidityPositions";
import { useAllPools, useAllPoolPrices, useTokenPrices, DISPLAY_CAP, type AllPool } from "@/hooks/useAllPools";
import { useRemoveLiquidity } from "@/hooks/useRemoveLiquidity";
import { useApprove } from "@/hooks/useApprove";
import { useToast } from "./Toaster";
import { TokenLogo } from "./TokenLogo";
import { formatAmount, formatUsd } from "@/lib/format";
import { computeMinAmountOut } from "@/lib/swap";
import { getChainMeta } from "@/config/chains";
import { getLiquidityAddedAt } from "@/lib/recentLiquidity";
import { ERC20_ABI } from "@/config/abis/erc20";
import { getRouterAddresses } from "@/config/contracts";
import { formatUnits } from "viem";
import { type SwapToken } from "@/config/tokens";
import { useTranslation } from "./LanguageProvider";

const PCTS = [25, 50, 75, 100];

export function LiquidityList() {
  const { t } = useTranslation();
  const router = useRouter();
  const { address, isConnected, chainId: connectedChain } = useAccount();
  const { connect, connectors } = useConnect();
  const chainId = connectedChain ?? bsc.id;

  const [tab, setTab] = useState<"all" | "mine">("all");
  const [removing, setRemoving] = useState<LiquidityPosition | null>(null);

  const { data: allPools, isLoading: allLoading } = useAllPools(chainId);
  // Prices resolve independently of the list: the pools paint first, values
  // "pop in" when this settles. Disabled until the basic list is available.
  const { data: priceMap } = useAllPoolPrices(chainId, allPools);
  const { data: positions, isLoading: mineLoading, refetch } = useLiquidityPositions(address, chainId);

  // Unique tokens across the user's positions — priced in parallel once, so the
  // "My Positions" USD values paint with the positions and "pop in" afterwards
  // (same progressive treatment as the All Pools tab).
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
  function goAddPair(tokenA: SwapToken, tokenB: SwapToken) {
    if (!isConnected) {
      if (connectors[0]) connect({ connector: connectors[0] });
      return;
    }
    const params = new URLSearchParams();
    params.set("step", "1");
    params.set("currencyA", tokenA.isNative ? tokenA.symbol : tokenA.address);
    params.set("currencyB", tokenB.isNative ? tokenB.symbol : tokenB.address);
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
      <TabBar tab={tab} onTab={setTab} onAdd={goAdd} />

      {tab === "all" ? (
        <AllPoolsView
          data={allPools}
          isLoading={allLoading}
          priceMap={priceMap}
          onAdd={goAddPair}
        />
      ) : (
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
      )}
    </>
  );
}

// Tab switcher that replaces the old "Your Liquidity" heading. The "All Pools"
// tab is public (no wallet needed); "My Positions" requires a connection.
function TabBar({
  tab,
  onTab,
  onAdd,
}: {
  tab: "all" | "mine";
  onTab: (t: "all" | "mine") => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full max-w-6xl items-center justify-between gap-3 px-1">
      <div className="flex gap-1 rounded-full border border-[var(--border)] bg-[var(--input-bg)] p-1">
        <button
          onClick={() => onTab("all")}
          className={
            "rounded-full px-4 py-1.5 text-sm font-semibold transition " +
            (tab === "all"
              ? "bg-brand-gradient text-[#0b0b14] shadow-glow"
              : "text-[var(--text-muted)] hover:text-[var(--text)]")
          }
        >
          {t("liquidity.tabAll")}
        </button>
        <button
          onClick={() => onTab("mine")}
          className={
            "rounded-full px-4 py-1.5 text-sm font-semibold transition " +
            (tab === "mine"
              ? "bg-brand-gradient text-[#0b0b14] shadow-glow"
              : "text-[var(--text-muted)] hover:text-[var(--text)]")
          }
        >
          {t("liquidity.tabMine")}
        </button>
      </div>
      <button
        onClick={onAdd}
        className="btn-primary rounded-full px-4 py-2 text-sm font-semibold"
      >
        + {t("liquidity.add")}
      </button>
    </div>
  );
}

// "All Pools" tab: every on-chain pool, with reserves and a USD value that
// fills in once prices resolve. Fully usable without a connected wallet.
function AllPoolsView({
  data,
  isLoading,
  priceMap,
  onAdd,
}: {
  data: AllPool[] | undefined;
  isLoading: boolean;
  priceMap: Map<string, number | null> | undefined;
  onAdd: (a: SwapToken, b: SwapToken) => void;
}) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="grid w-full max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="glass animate-fade-up rounded-3xl p-8">
            <div className="shimmer h-24 w-full rounded-2xl bg-[var(--input-bg)]" />
          </div>
        ))}
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="glass w-full max-w-6xl animate-fade-up rounded-3xl p-10 text-center text-sm text-[var(--text-muted)]">
        {t("liquidity.noPositions")}
      </div>
    );
  }

  const display = data.slice(0, DISPLAY_CAP);
  const truncated = data.length > DISPLAY_CAP;

  return (
    <>
      <div className="grid w-full max-w-6xl grid-cols-1 gap-4 animate-fade-up lg:grid-cols-2">
        {display.map((p) => (
          <PoolCard
            key={p.pair}
            pool={p}
            valueUsd={poolValueUsd(p, priceMap)}
            onAdd={onAdd}
          />
        ))}
      </div>
      {truncated && (
        <p className="w-full max-w-6xl px-1 text-xs text-[var(--text-muted)]">
          {t("liquidity.showingTop", { n: DISPLAY_CAP })}
        </p>
      )}
    </>
  );
}

// USD value of a pool's reserves. Returns:
//   undefined → prices still loading (card shows a shimmer)
//   null      → a component token has no on-chain route (card shows "—")
//   number    → resolved USD value
function poolValueUsd(
  pool: AllPool,
  priceMap: Map<string, number | null> | undefined
): number | null | undefined {
  if (!priceMap) return undefined;
  const pa = priceMap.get(pool.tokenA.address.toLowerCase());
  const pb = priceMap.get(pool.tokenB.address.toLowerCase());
  if (pa === undefined || pb === undefined) return undefined;
  if (pa === null || pb === null) return null;
  const amtA = Number(formatUnits(pool.reserveA, pool.tokenA.decimals));
  const amtB = Number(formatUnits(pool.reserveB, pool.tokenB.decimals));
  return amtA * pa + amtB * pb;
}

// USD value of the user's holdings in a position. Same return contract as
// poolValueUsd: undefined → prices still loading (card shows a shimmer),
// null → a component token has no on-chain route (card shows "—"), number →
// resolved USD value.
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

function PoolCard({
  pool,
  valueUsd,
  onAdd,
}: {
  pool: AllPool;
  valueUsd: number | null | undefined;
  onAdd: (a: SwapToken, b: SwapToken) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="glass flex flex-col gap-4 rounded-3xl p-5 transition-transform duration-300 hover:-translate-y-0.5">
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-2">
          <TokenLogo token={pool.tokenA} size={34} />
          <TokenLogo token={pool.tokenB} size={34} />
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-base font-bold">
            {pool.tokenA.symbol} / {pool.tokenB.symbol}
          </span>
          {valueUsd === undefined ? (
            <div className="shimmer mt-1 h-3 w-20 rounded bg-[var(--input-bg)]" />
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              {valueUsd != null ? formatUsd(valueUsd) : "—"}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <AmountRow token={pool.tokenA} amount={pool.reserveA} />
        <AmountRow token={pool.tokenB} amount={pool.reserveB} />
      </div>

      <button
        onClick={() => onAdd(pool.tokenA, pool.tokenB)}
        className="btn-primary w-full rounded-xl py-2 text-sm font-bold"
      >
        {t("liquidity.addBtn")}
      </button>
    </div>
  );
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
      <div className="glass w-full max-w-6xl animate-fade-up rounded-3xl p-8">
        <div className="shimmer h-4 w-1/2 rounded bg-[var(--input-bg)]" />
        <div className="shimmer mt-3 h-16 w-full rounded-2xl bg-[var(--input-bg)]" />
      </div>
    );
  }

  if (!positions || positions.length === 0) {
    return (
      <div className="grid w-full max-w-6xl grid-cols-1 gap-4 animate-fade-up lg:grid-cols-2">
        <AddPlaceholder onClick={onAdd} />
        <QuickStartGuide />
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-6xl grid-cols-1 gap-4 animate-fade-up lg:grid-cols-2">
      {sortedPositions?.map((p) => {
        // USD value of the user's holdings, derived from the parallel price map.
        // undefined → prices still loading (skeleton), null → no route ("—").
        const valueUsd = positionValueUsd(p, priceMap);
        return (
        <div
          key={p.pair}
          className="glass flex items-center gap-4 rounded-3xl p-5 transition-transform duration-300 hover:-translate-y-0.5"
        >
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex -space-x-2">
                <TokenLogo token={p.tokenA} size={34} />
                <TokenLogo token={p.tokenB} size={34} />
              </div>
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-base font-bold">
                  {p.tokenA.symbol} / {p.tokenB.symbol}
                </span>
                {valueUsd === undefined ? (
                  <div className="shimmer mt-1 h-3 w-20 rounded bg-[var(--input-bg)]" />
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">
                    {valueUsd != null ? formatUsd(valueUsd) : "—"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <AmountRow token={p.tokenA} amount={p.amountA} />
              <AmountRow token={p.tokenB} amount={p.amountB} />
            </div>

            <div className="mt-1 flex gap-2.5">
              <button
                onClick={() => onRemove(p)}
                className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--input-bg)] py-2 text-sm font-semibold transition hover:bg-[var(--hover)]"
              >
                {t("liquidity.remove")}
              </button>
              <button
                onClick={() => onAddFor(p)}
                className="btn-primary flex-1 rounded-xl py-2 text-sm font-bold"
              >
                {t("liquidity.addBtn")}
              </button>
            </div>
          </div>

          <ShareRing share={p.share} label={t("liquidity.share")} />
        </div>
        );
      })}

      {/* Quick-add placeholder: fills the next grid cell so a single (or few)
          position doesn't leave an empty right column, and doubles as a clear
          add-liquidity entry point. */}
      <AddPlaceholder onClick={onAdd} />

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
function AddPlaceholder({ className = "", onClick }: { className?: string; onClick?: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const handleClick = onClick ?? (() => router.push("/liquidity/add?step=1"));
  return (
    <button
      onClick={handleClick}
      className={
        "flex min-h-[180px] w-full flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-[rgba(232,185,35,0.35)] bg-[rgba(232,185,35,0.03)] p-5 text-center transition hover:border-[rgba(232,185,35,0.65)] hover:bg-[rgba(232,185,35,0.07)] " +
        className
      }
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-gradient text-2xl font-light text-[#0b0b14] shadow-glow">
        +
      </span>
      <span className="text-sm font-bold">{t("liquidity.addNew")}</span>
      <span className="text-xs text-[var(--text-muted)]">{t("liquidity.addNewHint")}</span>
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
    <div className="glass rounded-3xl p-6">
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
    <div className="glass flex h-full w-full flex-col items-center justify-center rounded-3xl px-6 py-16 text-center">
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
        className="btn-primary mt-7 rounded-full px-8 py-3 text-sm font-bold"
      >
        {isPending ? t("common.connecting") : t("common.connectWallet")}
      </button>
    </div>
  );
}

function AmountRow({ token, amount }: { token: SwapToken; amount: bigint }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-[var(--input-bg)] px-3 py-2">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <TokenLogo token={token} size={18} />
        {token.symbol}
      </div>
      <span className="text-sm font-bold">{formatAmount(amount, token.decimals)}</span>
    </div>
  );
}

// Pool-share donut: gold arc fills proportionally to `share` (a 0..1 fraction).
// For "My Positions" it's the user's share of that pool; for "All Pools" it's
// the pool's share of total platform liquidity. Gradient id must be unique per
// card, hence useId.
function ShareRing({ share, label }: { share: number; label: string }) {
  const id = useId();
  const pct = Math.max(0, Math.min(100, share * 100));
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);
  const display = pct >= 99.95 ? "100" : pct.toFixed(1);
  return (
    <div className="relative h-24 w-24 flex-none">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} stroke="rgba(255,255,255,0.06)" strokeWidth="8" fill="none" />
        <circle
          cx="48"
          cy="48"
          r={r}
          stroke={`url(#${id})`}
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#f5c542" />
            <stop offset="1" stopColor="#e8b923" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-bold">{display}%</span>
        <span className="text-[10px] text-[var(--text-muted)]">{label}</span>
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
