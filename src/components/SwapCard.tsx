"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useConnect, usePublicClient, useSwitchChain } from "wagmi";
import { parseUnits, maxUint256 } from "viem";
import clsx from "clsx";
import {
  getTokenList,
  getNativeToken,
  getTokenByAddress,
  getDefaultTokenIn,
  getDefaultTokenOut,
  type SwapToken,
} from "@/config/tokens";
import { getRouterAddresses, WNATIVE, SWAP_FEE_BPS } from "@/config/contracts";
import { useSwapQuote } from "@/hooks/useSwapQuote";
import { useSwapQuoteOut } from "@/hooks/useSwapQuoteOut";
import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { useApprove } from "@/hooks/useApprove";
import { useSwapWrite } from "@/hooks/useSwapWrite";
import { TokenLogo } from "./TokenLogo";
import { TokenSelectModal } from "./TokenSelectModal";
import { SwapConfirmModal } from "./SwapConfirmModal";
import { useTranslation } from "./LanguageProvider";
import { useToast } from "./Toaster";
import {
  formatAmount,
  formatSlippage,
  formatPriceImpact,
  priceImpactColor,
} from "@/lib/format";
import { getChainMeta, SUPPORTED_CHAINS, DEFAULT_CHAIN_ID } from "@/config/chains";
import { SlippageSettings, loadSavedSlippage } from "./SlippageSettings";
import { useNativeWrap, useWnativeAllowance } from "@/hooks/useNativeWrap";
import type { Address } from "@/lib/swap";

// True when the chosen pair is the native coin against its own wrapped asset
// (e.g. BNB ↔ WBNB on BSC). This is NOT a real swap — it's a wrap/unwrap
// against the WNATIVE contract, so we bypass the router quote/route machinery
// entirely and show a 1:1, no-slippage wrap/unwrap UI instead.
function isWrapUnwrapPair(
  tokenIn: SwapToken | undefined,
  tokenOut: SwapToken | undefined,
  chainId: number
): boolean {
  if (!tokenIn || !tokenOut) return false;
  const wnative = WNATIVE[chainId];
  if (!wnative) return false;
  const inNativeOutWrapped =
    tokenIn.isNative && !tokenOut.isNative && tokenOut.address.toLowerCase() === wnative.toLowerCase();
  const inWrappedOutNative =
    !tokenIn.isNative && tokenIn.address.toLowerCase() === wnative.toLowerCase() && tokenOut.isNative;
  return Boolean(inNativeOutWrapped || inWrappedOutNative);
}

// Build a display token for a route-hop address. The wrapped-native node is
// shown as whichever side of the trade is the wrapped/native token: a native
// BNB→USDT trade still routes through WBNB internally, so it should display as
// BNB; but a WBNB→USDT trade (where tokenIn is the wrapped coin) should display
// as WBNB — not the native coin.
function buildRouteToken(
  addr: Address,
  chainId: number,
  tokenIn: SwapToken | undefined,
  tokenOut: SwapToken | undefined
): SwapToken {
  const wnative = WNATIVE[chainId];
  const addrLower = addr.toLowerCase();
  const inAddr = tokenIn?.address.toLowerCase();
  const outAddr = tokenOut?.address.toLowerCase();
  if (addrLower === wnative.toLowerCase()) {
    if (inAddr === wnative.toLowerCase()) return tokenIn!;
    if (outAddr === wnative.toLowerCase()) return tokenOut!;
    return getNativeToken(chainId);
  }
  if (inAddr && addrLower === inAddr) return tokenIn!;
  if (outAddr && addrLower === outAddr) return tokenOut!;
  return (
    getTokenByAddress(chainId, addr) ?? {
      address: addr,
      symbol: `${addr.slice(0, 4)}…${addr.slice(-2)}`,
      name: addr,
      decimals: 18,
      chainId,
    }
  );
}

// Map a URL param value ("BNB" for native, an address for ERC20) back to a
// SwapToken for the active chain. Mirrors the add-liquidity page so deep links
// share the same currencyA / currencyB convention.
function resolveToken(chainId: number, value?: string | null): SwapToken | undefined {
  if (!value) return undefined;
  const native = getNativeToken(chainId);
  if (value.toLowerCase() === native.symbol.toLowerCase()) return native;
  return getTokenByAddress(chainId, value as Address);
}

// Serialize a token to its URL param value: native coin → its symbol (e.g.
// "BNB"), ERC20 → its contract address. Keeps the swap URL consistent with the
// add-liquidity page.
function paramValue(t?: SwapToken): string | undefined {
  return t ? (t.isNative ? t.symbol : t.address) : undefined;
}

// Human-readable names for chains the wallet might be connected to but which
// aren't in our configured set (wagmi can't resolve chain.name for them, and
// we don't want to surface a raw number like "1" in the UI).
const KNOWN_CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Smart Chain",
  97: "BNB Smart Chain Testnet",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  8453: "Base",
  43114: "Avalanche",
};

function unsupportedChainLabel(chainId: number | undefined): string {
  if (chainId === undefined) return "";
  return KNOWN_CHAIN_NAMES[chainId] ?? `Chain ${chainId}`;
}

export function SwapCard() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const curA = searchParams.get("currencyA");
  const curB = searchParams.get("currencyB");
  const { address, isConnected, chainId: connectedChain, chain } = useAccount();
  // If the connected wallet's chain is configured in the project, use it so the
  // native token becomes the default "from" token. Otherwise fall back to the
  // default chain (DEFAULT_CHAIN_ID) for display and surface an "unsupported
  // chain" notice.
  const connectedChainSupported =
    isConnected && SUPPORTED_CHAINS.includes(connectedChain ?? -1);
  const chainId = connectedChainSupported
    ? (connectedChain as number)
    : DEFAULT_CHAIN_ID;
  // Deep-linked tokens from the URL (shared convention with the add-liquidity
  // page). If absent or unresolvable, fall back to the per-chain default pair.
  const linkedIn = curA ? resolveToken(chainId, curA) : undefined;
  const linkedOut = curB ? resolveToken(chainId, curB) : undefined;
  const unsupportedChain = isConnected && !connectedChainSupported;
  const publicClient = usePublicClient({ chainId });
  const { approve } = useApprove();
  const { swap, isPending: swapping } = useSwapWrite();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { switchChainAsync, isPending: switchingChain } = useSwitchChain();
  const queryClient = useQueryClient();
  const { deposit, withdraw, approveWnative } = useNativeWrap();

  // Seed defaults from the per-chain default pair config (DEFAULT_TOKENS) so
  // neither field flashes an empty "Select" before the effect runs.
  const [tokenIn, setTokenIn] = useState<SwapToken | undefined>(() =>
    linkedIn ?? getDefaultTokenIn(chainId)
  );
  const [tokenOut, setTokenOut] = useState<SwapToken | undefined>(() =>
    linkedOut ?? getDefaultTokenOut(chainId)
  );
  // Native ↔ wrapped-native wrap/unwrap pair (BNB ↔ WBNB). When true we bypass
  // the router quote path and use a 1:1 wrap/unwrap flow (see isWrapUnwrapPair).
  const isWrap = isWrapUnwrapPair(tokenIn, tokenOut, chainId);
  // True when either side is a transfer-fee / tax / reflection token. These
  // cannot use exact-output (no ForExactTokens Supporting variant) and must
  // route through the router's `SupportingFeeOnTransferTokens` family. We force
  // exact-in for the whole trade and disable the "receive" box below.
  const eitherFeeOnTransfer =
    !!tokenIn?.isFeeOnTransfer || !!tokenOut?.isFeeOnTransfer;
  // Single source of truth: which field the user is editing, and the typed text.
  const [independentField, setIndependentField] = useState<"in" | "out">("in");
  const [typedValue, setTypedValue] = useState("");
  const savedSlippage = useMemo(() => loadSavedSlippage(), []);
  const [slippageBps, setSlippageBps] = useState(savedSlippage.bps);
  const [autoSlippage, setAutoSlippage] = useState(savedSlippage.auto);
  const [modalSide, setModalSide] = useState<"in" | "out" | null>(null);
  // Refs to the two amount inputs so Tab can move focus between them.
  const inRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLInputElement>(null);
  const [showInverseRate, setShowInverseRate] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  // Swap/Limit segmented tab. "limit" is a placeholder for now — disabled and
  // not clickable; only the swap flow is wired up.
  const [activeTab, setActiveTab] = useState<"swap" | "limit">("swap");
  // Which amount box is currently selected (focused). Defaults to the sell /
  // Token1 box; the selected box gets a 1px white-tinted border. We only set on
  // focus (never clear on blur) so exactly one box always appears selected.
  const [focusedField, setFocusedField] = useState<"in" | "out">("in");
  // Focus the Token1 (sell) input on mount so the caret is placed there and the
  // box shows as selected immediately on page load.
  useEffect(() => {
    inRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { toast } = useToast();

  // On chain settle / change: re-resolve the URL tokens against the *new*
  // chainId rather than discarding them. This is essential because on first
  // load the wallet hasn't reconnected yet, so chainId is the default
  // (DEFAULT_CHAIN_ID) and a testnet deep link like currencyA=tBNB wouldn't
  // resolve — then once the wallet reconnects to testnet (97) we must
  // re-resolve against 97, NOT clear
  // the URL. We only fall back to defaults and clear the stale params when the
  // URL tokens genuinely fail to resolve on the settled chain.
  // Tracked via prevChainRef so this only fires on a real chain change after
  // mount (survives React StrictMode's double-invoked mount effect).
  const prevChainRef = useRef<number | null>(null);
  useEffect(() => {
    if (prevChainRef.current === null) {
      prevChainRef.current = chainId;
      return;
    }
    if (prevChainRef.current === chainId) return;
    prevChainRef.current = chainId;

    const a = searchParams.get("currencyA");
    const b = searchParams.get("currencyB");
    const nextIn = a ? resolveToken(chainId, a) : undefined;
    const nextOut = b ? resolveToken(chainId, b) : undefined;

    if (nextIn || nextOut) {
      // URL tokens still valid on the settled chain → adopt them, keep URL.
      setTokenIn(nextIn ?? getDefaultTokenIn(chainId));
      setTokenOut(nextOut ?? getDefaultTokenOut(chainId));
    } else {
      // Stale params for this chain → reset to defaults and clear URL.
      setTokenIn(getDefaultTokenIn(chainId));
      setTokenOut(getDefaultTokenOut(chainId));
      router.replace("/swap", { scroll: false });
    }
    setTypedValue("");
    setIndependentField("in");
  }, [chainId, router, searchParams]);

  // A transfer-fee token can only trade in exact-input mode. If the user had
  // the "receive" box active (exact-out) and then selects a fee token, snap
  // the independent field back to "in" so the trade can't be routed through an
  // unsupported exact-output path.
  useEffect(() => {
    if (eitherFeeOnTransfer && independentField === "out") {
      setIndependentField("in");
    }
  }, [eitherFeeOnTransfer, independentField]);

  // Reflect the chosen pair in the URL (currencyA = Token1, currencyB = Token2)
  // so the swap state is shareable / bookmarkable. Called only on explicit
  // user actions (token select, flip) — never on first mount, so opening the
  // page with the default pair keeps the URL clean (/swap, no params).
  function updateUrl(tin?: SwapToken, tout?: SwapToken) {
    const params = new URLSearchParams();
    const a = paramValue(tin);
    const b = paramValue(tout);
    if (a) params.set("currencyA", a);
    if (b) params.set("currencyB", b);
    const qs = params.toString();
    router.replace(qs ? `/swap?${qs}` : "/swap", { scroll: false });
  }

  const isExactOut = independentField === "out" && !eitherFeeOnTransfer;

  // Forward quote (typing in "pay") and reverse quote (typing in "receive").
  // Skipped entirely for the wrap/unwrap pair — it has no router route.
  const forwardQuote = useSwapQuote({
    tokenIn: isWrap ? undefined : tokenIn,
    tokenOut: isWrap ? undefined : tokenOut,
    amountIn: isExactOut ? "" : typedValue,
    slippageBps,
    autoSlippage,
    chainId,
  });
  const reverseQuote = useSwapQuoteOut({
    tokenIn: isWrap ? undefined : tokenIn,
    tokenOut: isWrap ? undefined : tokenOut,
    amountOut: isExactOut ? typedValue : "",
    slippageBps,
    autoSlippage,
    chainId,
  });

  // The router that produced the active quote drives both the allowance check
  // and the on-chain calls below, so an order routed through the secondary
  // router is approved against and executed on that router — not the primary.
  const activeQuote = isExactOut ? reverseQuote.data : forwardQuote.data;

  const { data: balanceIn } = useTokenBalance(tokenIn, address, chainId);
  const { data: balanceOut } = useTokenBalance(tokenOut, address, chainId);
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    isWrap ? undefined : tokenIn,
    address,
    isWrap ? undefined : tokenIn && (activeQuote?.router ?? getRouterAddresses(chainId).primary),
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

  // Wrap/unwrap: the spent and received amounts are identical (1:1). The
  // "independent field" value is the source of truth; both boxes mirror it.
  const wrapWei = useMemo(() => {
    if (!isWrap || !tokenIn || !typedValue) return 0n;
    try {
      return parseUnits(typedValue, tokenIn.decimals);
    } catch {
      return 0n;
    }
  }, [isWrap, tokenIn, typedValue]);

  // WBNB→BNB (unwrap) requires the user to first approve WBNB to the WNATIVE
  // contract. BNB→WBNB (wrap) needs no approval (native value is sent directly).
  const wnative = WNATIVE[chainId];
  const { data: wnativeAllowance, refetch: refetchWnativeAllowance } = useWnativeAllowance(
    isWrap && !tokenIn?.isNative ? (tokenIn?.address as Address) : undefined,
    isWrap && wnative ? wnative : undefined,
    address
  );
  const wrapNeedsApproval =
    isWrap && !tokenIn?.isNative && wrapWei > 0n && (wnativeAllowance ?? 0n) < wrapWei;

  // `isLoading` is true only on the very first fetch (no data yet).
  // Background polling refetches keep `data` (via keepPreviousData) and are
  // NOT `isLoading`, so we drive the spinner / card-hide off `isLoading` to
  // avoid flicker every 5s — the quote updates silently as reserves change.
  const isLoading = isExactOut ? reverseQuote.isLoading : forwardQuote.isLoading;

  // Effective slippage to display. Manual mode uses the local `slippageBps`
  // so the rate line updates the instant the user picks a value — it must NOT
  // wait for the quote to reload (an old quote is always present via
  // keepPreviousData, which would otherwise show the stale quote slippage).
  // Auto mode falls back to the quote-derived value (or the 0.5% floor before
  // the first quote resolves).
  const effectiveSlippageBps = autoSlippage
    ? activeQuote?.slippageBps ?? 50
    : slippageBps;

  // True when the user actually entered a non-zero amount in either box.
  // Used so the button only shows "請輸入數量" when nothing was typed — typing
  // in the receive (Token2) box must NOT trigger the "enter amount" prompt
  // while the reverse quote is still resolving (payWei is 0 mid-fetch).
  const hasAmountInput = typedValue.trim() !== "" && Number(typedValue) > 0;

  // Detect when the user has changed the independent amount/tokens since the
  // last quote resolved. Background polling keeps `data` (via keepPreviousData)
  // and does NOT set `isLoading`, so we track a quote key and mark it stale
  // while the new quote is still catching up. This makes the swap button and
  // detail card show a fetching state immediately when the user types, without
  // flickering every 5s on background refreshes.
  const currentQuoteKey = useMemo(() => {
    if (!tokenIn || !tokenOut || !hasAmountInput) return null;
    return `${chainId}:${tokenIn.address}:${tokenOut.address}:${independentField}:${typedValue}:${slippageBps}:${autoSlippage}`;
  }, [chainId, tokenIn, tokenOut, independentField, typedValue, slippageBps, autoSlippage, hasAmountInput]);

  const currentQuoteKeyRef = useRef(currentQuoteKey);
  useEffect(() => {
    currentQuoteKeyRef.current = currentQuoteKey;
  }, [currentQuoteKey]);

  const [syncedQuoteKey, setSyncedQuoteKey] = useState<string | null>(null);
  useEffect(() => {
    setSyncedQuoteKey((prev) => {
      const key = currentQuoteKeyRef.current;
      return key && key !== prev ? key : prev;
    });
  }, [forwardQuote.data, reverseQuote.data]);

  const quoteStale = hasAmountInput && currentQuoteKey !== null && currentQuoteKey !== syncedQuoteKey;
  const isFetchingQuote = isLoading || quoteStale;

  const needsApproval = isWrap ? wrapNeedsApproval : !!tokenIn && !tokenIn.isNative && payWei > 0n && allowance < payWei;

  const balanceInNum = balanceIn ?? 0n;
  const balanceOutNum = balanceOut ?? 0n;
  const insufficient = isWrap ? wrapWei > balanceInNum : payWei > balanceInNum;

  // Displayed input values.
  // - The box the user is actively typing in always shows `typedValue`
  //   directly (never blanked), so decimals like "0.1" type fine through the
  //   intermediate "0" / "0." steps.
  // - The opposite (derived) box is cleared whenever the typed value is not a
  //   positive amount — i.e. truly empty OR parseable to 0 ("0", "0.0",
  //   "0.00"). This way clearing the focused box, or entering "0.00", also
  //   clears the other box.
  // While a quote is fetching (first load OR the user just changed the
  // independent amount/tokens and the new quote hasn't resolved), the *opposite*
  // (derived) box is blanked instead of showing the stale previous result. The
  // focused box keeps `typedValue` untouched. So: typing Token1 clears Token2,
  // and typing Token2 clears Token1 — until the new quote lands.
  const payValue = isWrap
    ? // 1:1 wrap/unwrap: the dependent box simply mirrors the typed value.
      independentField === "in"
      ? typedValue
      : typedValue
    : isExactOut
    ? !hasAmountInput || isFetchingQuote
      ? ""
      : reverseQuote.data
      ? formatAmount(reverseQuote.data.amountIn, tokenIn?.decimals ?? 18)
      : ""
    : typedValue;
  const receiveValue = isWrap
    ? typedValue
    : isExactOut
    ? typedValue
    : !hasAmountInput || isFetchingQuote
    ? ""
    : forwardQuote.data
    ? formatAmount(forwardQuote.data.amountOut, tokenOut?.decimals ?? 18)
    : "";

  // Retrigger the CSS flash animation on the dependent amount input whenever a
  // background price tick changes its displayed value (but never on user typing).
  const prevPayRef = useRef(payValue);
  const prevReceiveRef = useRef(receiveValue);
  const prevTypedRef = useRef(typedValue);

  function flashAmount(side: "in" | "out") {
    const el = side === "in" ? inRef.current : outRef.current;
    if (!el) return;
    el.classList.remove("swap-value-flash");
    void el.offsetWidth; // force reflow so the animation restarts cleanly
    el.classList.add("swap-value-flash");
  }

  useEffect(() => {
    const typedChanged = typedValue !== prevTypedRef.current;
    if (!typedChanged) {
      if (independentField === "in" && receiveValue !== prevReceiveRef.current) {
        flashAmount("out");
      }
      if (independentField === "out" && payValue !== prevPayRef.current) {
        flashAmount("in");
      }
    }
    prevPayRef.current = payValue;
    prevReceiveRef.current = receiveValue;
    prevTypedRef.current = typedValue;
  }, [payValue, receiveValue, typedValue, independentField]);

  function onTypeIn(v: string) {
    setIndependentField("in");
    setTypedValue(v);
  }
  function onTypeOut(v: string) {
    // Fee-on-transfer tokens forbid exact-output mode, so typing in the
    // "receive" box is disabled — the trade always keys off the "pay" box.
    if (eitherFeeOnTransfer) return;
    setIndependentField("out");
    setTypedValue(v);
  }

  // independent field, and KEEP typedValue. The value stays attached to the
  // field role, so the now-dependent box recalculates automatically.
  function flip() {
    const nextIn = tokenOut;
    const nextOut = tokenIn;
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    setIndependentField((f) => (f === "in" ? "out" : "in"));
    updateUrl(nextIn, nextOut);
  }

  function onSelect(side: "in" | "out", tk: SwapToken) {
    let nextIn = tokenIn;
    let nextOut = tokenOut;
    if (side === "in") {
      // Picking the token currently on the other side moves it here, and the
      // old "in" token takes its place — a swap, not a disable. (Matches the
      // "I clicked USDT in Token1's list → Token1=USDT, Token2=BNB" behavior.)
      if (tokenOut && tk.address === tokenOut.address) {
        nextOut = tokenIn;
      }
      nextIn = tk;
    } else {
      if (tokenIn && tk.address === tokenIn.address) {
        nextIn = tokenOut;
      }
      nextOut = tk;
    }
    setTokenIn(nextIn);
    setTokenOut(nextOut);
    // Only when the Token1 (sell) token actually changes do we clear both input
    // boxes and refocus Token1. Changing Token2 keeps the typed amount attached
    // to its box so the opposite quote recomputes for the new token automatically.
    if (side === "in" && nextIn?.address !== tokenIn?.address) {
      setTypedValue("");
      setIndependentField("in");
      // Defer focus until after the select modal closes and the inputs
      // re-render, so the caret lands in the Token1 box.
      setTimeout(() => inRef.current?.focus(), 0);
    }
    // Keep the URL in sync with the chosen pair so the swap is shareable.
    updateUrl(nextIn, nextOut);
  }

  function setMax() {
    if (!tokenIn || balanceIn == null) return;
    setIndependentField("in");
    if (tokenIn.isNative) {
      const buffer = parseUnits("0.01", tokenIn.decimals);
      // Keep a small gas buffer, but never floor the input to 0. If the
      // balance is too small to leave the buffer, fill the whole balance so
      // the box shows a real number instead of "0".
      const maxWei = balanceIn > buffer ? balanceIn - buffer : balanceIn;
      setTypedValue(formatAmount(maxWei, tokenIn.decimals));
    } else {
      setTypedValue(formatAmount(balanceIn, tokenIn.decimals));
    }
  }

  // Fill the "sell" input with a percentage of the Token1 balance. Native token
  // max is handled separately (it keeps a small gas buffer); exact percentages
  // for native tokens do NOT subtract the buffer because the user asked for it.
  function setPercentIn(pct: number) {
    if (!tokenIn || balanceIn == null) return;
    setIndependentField("in");
    const amount = (balanceIn * BigInt(pct)) / 100n;
    setTypedValue(formatAmount(amount, tokenIn.decimals));
  }

  // Same as setMax but for the "receive" (Token2) box: clicking the balance
  // fills the input with the maximum Token2 balance (exact-out target). Not
  // allowed for fee-on-transfer tokens, which can't do exact-output.
  function setMaxOut() {
    if (!tokenOut || balanceOut == null || eitherFeeOnTransfer) return;
    setIndependentField("out");
    setTypedValue(formatAmount(balanceOut, tokenOut.decimals));
  }

  // Approve the sold token (tokenIn) for the router. Driven by the confirm
  // modal button when the user still needs to grant allowance. After the
  // receipt lands we refetch the allowance so the button flips to "确认兑换".
  async function approveTokenIn() {
    if (!tokenIn || !publicClient || tokenIn.isNative || payWei <= 0n || allowance >= payWei) return;
    setBusy(true);
    const router = activeQuote?.router ?? getRouterAddresses(chainId).primary;
    try {
      const h = await approve(tokenIn.address, router, maxUint256);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: h,
        timeout: 180_000,
      });
      if (receipt.status !== "success") {
        // On-chain execution reverted — not a valid approval.
        queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
        return;
      }
      // Approval is a transaction too — refresh the allowance so the "授权"
      // button flips to "确认兑换", and refresh balances.
      await refetchAllowance();
      queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
    } catch {
      // Wallet rejection or other error — swallow. The modal stays open with
      // the button reset, so the user can retry directly.
    } finally {
      setBusy(false);
    }
  }

  // Wrap / unwrap the native asset against the WNATIVE contract (BNB↔WBNB).
  // 1:1 and slippage-free. BNB→WBNB calls `deposit` (value = BNB, no approval);
  // WBNB→BNB calls `withdraw` (after approving WBNB to the WNATIVE contract).
  async function doWrap() {
    if (!tokenIn || !tokenOut || !address || !publicClient || !wnative) return;
    if (wrapWei <= 0n) return;
    setBusy(true);
    try {
      let h: `0x${string}` | undefined;
      if (!tokenIn.isNative) {
        // Unwrap path: WBNB → BNB. Approve WBNB to the WNATIVE contract first
        // if the allowance is short.
        if (wrapNeedsApproval) {
          const approveHash = await approveWnative(tokenIn.address as Address, wnative);
          // Wait for the approval to be mined before reading the allowance —
          // otherwise the refetch still returns the pre-approval value and the
          // user would have to refresh to trade. Then continue to withdraw so
          // a single click completes approve + unwrap.
          await publicClient.waitForTransactionReceipt({
            hash: approveHash,
            timeout: 180_000,
          });
          await refetchWnativeAllowance();
        }
        h = await withdraw(wnative, wrapWei);
      } else {
        // Wrap path: BNB → WBNB. No approval needed (native value is sent).
        h = await deposit(wnative, wrapWei);
      }
      // Wait for the on-chain action to be mined BEFORE refreshing balances —
      // otherwise the balance query still returns the pre-tx value and the
      // input boxes wouldn't update until a manual refresh.
      if (h) {
        await publicClient.waitForTransactionReceipt({ hash: h, timeout: 180_000 });
      }
      queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
      setTypedValue("");
      setIndependentField("in");
      const explorer = getChainMeta(chainId)?.explorer;
      toast({
        type: "success",
        position: "top-right",
        message: (
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{t("swap.transactionSuccess")}</span>
            {explorer && h ? (
              <a
                href={`${explorer}/tx/${h}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-accent-soft hover:underline"
              >
                <span className="font-mono">{`${h.slice(0, 8)}…${h.slice(-6)}`}</span>
                <span>{t("common.viewExplorer")}</span>
              </a>
            ) : (
              h && (
                <span className="font-mono text-xs opacity-80">{`${h.slice(0, 8)}…${h.slice(-6)}`}</span>
              )
            )}
          </span>
        ),
      });
    } catch {
      // Wallet rejection or other error — swallow; the user can retry.
    } finally {
      setBusy(false);
    }
  }

  async function doSwap() {
    if (!tokenIn || !tokenOut || !address || !publicClient) return;
    if (unsupportedChain) return;
    if (payWei <= 0n) return;
    setBusy(true);
    const router = activeQuote?.router ?? getRouterAddresses(chainId).primary;
    try {
      const q = activeQuote;
      if (!q) {
        return;
      }
      const h = await swap({
        tokenIn,
        tokenOut,
        amountInWei: payWei,
        amountOutMinWei,
        path: q.path,
        router,
        to: address,
        // Fee-on-transfer tokens must use the Supporting family, which only
        // exists for exact-input swaps — force exact-in regardless of the
        // selected field.
        feeOnTransfer: eitherFeeOnTransfer,
        mode: eitherFeeOnTransfer ? "exactIn" : isExactOut ? "exactOut" : "exactIn",
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: h,
        timeout: 180_000,
      });
      if (receipt.status !== "success") {
        // On-chain execution reverted — surface as a failure. Keep the typed
        // amount so the user can adjust and retry.
        queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
        toast({
          type: "error",
          position: "top-right",
          message: t("swap.txReverted"),
        });
        return;
      }
      // Swap succeeded — refresh balances, clear the input, close the confirm
      // modal, and surface the transaction hash as a top-right notification.
      queryClient.invalidateQueries({ queryKey: ["balance", chainId] });
      setTypedValue("");
      setIndependentField("in");
      setShowConfirm(false);
      const explorer = getChainMeta(chainId)?.explorer;
      toast({
        type: "success",
        position: "top-right",
        message: (
          <span className="flex flex-col gap-1">
            <span className="font-semibold">{t("swap.transactionSuccess")}</span>
            {explorer ? (
              <a
                href={`${explorer}/tx/${h}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-accent-soft hover:underline"
              >
                <span className="font-mono">{`${h.slice(0, 8)}…${h.slice(-6)}`}</span>
                <span>{t("common.viewExplorer")}</span>
              </a>
            ) : (
              <span className="font-mono text-xs opacity-80">{`${h.slice(0, 8)}…${h.slice(-6)}`}</span>
            )}
          </span>
        ),
      });
    } catch (e: any) {
      // Surface the real failure instead of swallowing it. This branch also
      // catches pre-send estimate failures: when estimation (eth_estimateGas)
      // reverts, the wallet never broadcasts — which is exactly the "报错但都没
      // 上链" case. The revert reason is decoded by viem into `shortMessage`
      const reason = e?.shortMessage || e?.message || "";
      toast({
        type: "error",
        position: "top-right",
        message: t("swap.txError", { reason }),
      });
    } finally {
      setBusy(false);
    }
  }

  // The confirm modal's single action button dispatches the next pending step:
  // approve tokenIn, then swap. Each click performs exactly one on-chain
  // action; the button label reflects the current step (授权 X → 确认兑换).
  function onConfirmDispatch() {
    if (needsApproval) {
      approveTokenIn();
      return;
    }
    doSwap();
  }

  let buttonLabel = t("swap.title");
  let disabled = false;
  if (!isConnected)
    buttonLabel = connecting ? t("common.connecting") : t("common.connectWallet");
  else if (unsupportedChain) {
    buttonLabel = t("swap.unsupportedChain", {
      chain: unsupportedChainLabel(connectedChain),
    });
    disabled = true;
  } else if (!tokenIn || !tokenOut) {
    buttonLabel = t("swap.selectToken");
    disabled = true;
  } else if (!hasAmountInput) {
    buttonLabel = t("swap.enterAmount");
    disabled = true;
  } else if (isWrap) {
    // Wrap/unwrap has no quote — the only gating is balance. While the
    // on-chain action runs we keep the direction label (封装/解除封装) and
    // only disable the button; no "confirming" text and no spinner.
    if (insufficient) {
      buttonLabel = t("swap.insufficientBalance", { symbol: tokenIn?.symbol ?? "" });
      disabled = true;
    } else {
      buttonLabel = tokenIn.isNative ? t("swap.wrap") : t("swap.unwrap");
      disabled = busy;
    }
  } else if (isFetchingQuote) {
    // Quote is loading for the first time or the user changed the amount/
    // tokens and the new quote hasn't resolved yet. Show a spinner + fetching
    // label and keep the button disabled.
    buttonLabel = t("swap.fetchingQuote");
    disabled = true;
  } else if (!activeQuote) {
    // No trading route for this pair → surface "insufficient liquidity"
    // directly on the button. Checked BEFORE balance so a no-route pair is
    // never mislabeled as insufficient balance.
    buttonLabel = t("swap.noRoute");
    disabled = true;
  } else if (insufficient) {
    buttonLabel = t("swap.insufficientBalance", { symbol: tokenIn?.symbol ?? "" });
    disabled = true;
  } else if (busy || swapping) {
    buttonLabel = t("swap.confirming");
    disabled = true;
  }

  return (
    <div className="w-full max-w-md animate-fade-up rounded-[16px] border border-[var(--swap-card-border)] bg-[var(--swap-card-bg)] p-[var(--swap-card-pad)] shadow-[var(--swap-card-shadow)]">
      <div className="flex items-center justify-between px-1 pb-2 pt-1.5">
        {/* Tabs: 兑换 (active) / 限价 (placeholder, disabled) */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab("swap")}
            className={clsx(
              "px-3.5 py-1.5 text-[15px] font-medium transition rounded-radius",
              activeTab === "swap"
                ? "bg-[var(--setting-bg)] text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            {t("swap.tabSwap")}
          </button>
          <button
            type="button"
            disabled
            title={t("swap.tabLimitSoon")}
            className="cursor-not-allowed rounded-full px-3.5 py-1.5 text-[15px] font-medium text-[var(--text-muted)]"
          >
            {t("swap.tabLimit")}
          </button>
        </div>
        <SlippageSettings
          value={{ auto: autoSlippage, bps: slippageBps }}
          onChange={({ auto, bps }) => {
            setAutoSlippage(auto);
            setSlippageBps(bps);
          }}
          autoBps={effectiveSlippageBps}
        />
      </div>

      {unsupportedChain && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <span aria-hidden>⚠</span>
          <span>
            {t("swap.unsupportedChain", {
              chain: unsupportedChainLabel(connectedChain),
            })}
          </span>
          <button
            type="button"
            onClick={() => switchChainAsync({ chainId: DEFAULT_CHAIN_ID })}
            disabled={switchingChain}
            className="ml-auto rounded-full bg-amber-400/90 px-3 py-1 text-xs font-semibold text-black transition hover:bg-amber-300 disabled:opacity-60"
          >
            {switchingChain ? t("common.switching") : t("common.switchNetwork")}
          </button>
        </div>
      )}

      {eitherFeeOnTransfer && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          <span aria-hidden>⚠</span>
          <span>{t("swap.feeOnTransferNotice")}</span>
        </div>
      )}

      {/* From / Sell */}
      <div
        className={clsx(
          "group rounded-radius px-4 pb-2.5 pt-3 transition-colors",
          focusedField === "in"
            ? "border border-[var(--input-focus-border)]"
            : "border border-transparent bg-[var(--btn-bg)]"
        )}
      >
        <div className="text-sm-16 flex items-center justify-between text-color-muted">
          <span>{t("swap.youPay")}</span>
          {tokenIn && balanceIn != null && balanceIn > 0n && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              {[25, 50, 75].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setPercentIn(pct)}
                  className="rounded-md bg-[var(--setting-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text)] transition hover:bg-[var(--hover)]"
                >
                  {pct}%
                </button>
              ))}
              <button
                type="button"
                onClick={setMax}
                className="rounded-md bg-[var(--setting-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text)] transition hover:bg-[var(--hover)]"
              >
                {t("swap.max")}
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <input
            ref={inRef}
            inputMode="decimal"
            placeholder="0"
            value={payValue}
            onFocus={() => setFocusedField("in")}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*\.?\d*$/.test(v)) onTypeIn(v);
            }}
            onKeyDown={(e) => {
              // Tab from Token1 jumps straight to the Token2 input instead of
              // leaving the swap field group, keeping the cursor in the amount.
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                outRef.current?.focus();
              }
            }}
            className="w-full bg-transparent text-[32px] font-medium leading-tight-16 text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <TokenButton token={tokenIn} onClick={() => setModalSide("in")} />
        </div>
        <div className="mb-2 mt-1 flex min-h-[18px] items-center justify-end text-xs text-[var(--text-muted)]">
          {tokenIn && (
            <button onClick={setMax} className="transition text-balance">
              {formatAmount(balanceInNum, tokenIn.decimals)} {tokenIn.symbol}
            </button>
          )}
        </div>
      </div>

      {/* Flip */}
      <div className="relative h-0">
        <button
          onClick={flip}
          className="absolute left-1/2 top-1/2 z-10 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-[var(--swap-flip-ring)] bg-[var(--setting-bg)] text-[var(--text)] transition hover:bg-[var(--hover)]"
          title={t("swap.flip")}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </button>
      </div>

      {/* To / Buy */}
      <div
        className={clsx(
          "mt-1 rounded-radius px-4 pb-2.5 pt-3 transition-colors",
          focusedField === "out"
            ? "border border-[var(--input-focus-border)]"
            : "border border-transparent bg-[var(--btn-bg)]"
        )}
      >
        <div className="text-sm-16 text-color-muted">{t("swap.youReceive")}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <input
            ref={outRef}
            inputMode="decimal"
            placeholder={eitherFeeOnTransfer ? t("swap.feeOnTransferReceiveHint") : "0"}
            readOnly={eitherFeeOnTransfer}
            value={receiveValue}
            onFocus={() => setFocusedField("out")}
            onChange={(e) => {
              const v = e.target.value;
              if (/^\d*\.?\d*$/.test(v)) onTypeOut(v);
            }}
            className={clsx(
              "w-full bg-transparent text-[32px] font-medium leading-tight-16 text-[var(--text)] outline-none placeholder:text-[var(--text-muted)]",
              eitherFeeOnTransfer && "cursor-not-allowed opacity-80"
            )}
          />
          <TokenButton token={tokenOut} onClick={() => setModalSide("out")} />
        </div>
        <div className="mb-2 mt-1 flex min-h-[18px] items-center justify-end text-xs text-[var(--text-muted)]">
          {tokenOut && balanceOut != null && (
            <button onClick={setMaxOut} className="transition text-balance">
              {formatAmount(balanceOutNum, tokenOut.decimals)} {tokenOut.symbol}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => {
          if (!isConnected) {
            connect({ connector: connectors[0] });
            return;
          }
          // Both approval and swap happen inside the confirm modal's stepwise
          // action button (授权 X → 确认兑换), so always open it first.
          if (isWrap) {
            // Wrap/unwrap is a single, slippage-free step — execute directly
            // instead of opening the router-style confirm modal.
            doWrap();
            return;
          }
          setShowConfirm(true);
        }}
        disabled={disabled}
        className={clsx(
          "mt-1 flex w-full items-center justify-center gap-2 rounded-radius py-4 text-[18px] font-semibold transition",
          // Wrap/unwrap fires directly (no confirm modal), so keep the button
          // highlighted (not greyed) even while disabled during the tx — only
          // this pair gets the bright state; every other pair greys out.
          isWrap && disabled
            ? "bg-brand-gradient text-[#0b0b14]"
            : disabled
            ? "cursor-not-allowed bg-[var(--btn-bg)] text-[var(--text-muted)]"
            : "bg-brand-gradient text-[#0b0b14] hover:brightness-105"
        )}
      >
        {!isWrap && isFetchingQuote ? (
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

      {isWrap && hasAmountInput ? (
        // Wrap/unwrap: show only the 1:1 rate line, no slippage / route / fee.
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between text-[0.875rem] text-[var(--text-muted)]">
            <span>
              {showInverseRate
                ? `1 ${tokenOut?.symbol} = 1 ${tokenIn?.symbol}`
                : `1 ${tokenIn?.symbol} = 1 ${tokenOut?.symbol}`}
            </span>
            <button
              type="button"
              onClick={() => setShowInverseRate((v) => !v)}
              aria-label={t("swap.flip")}
              className="text-[var(--text-muted)] transition hover:text-[var(--text)]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                strokeWidth={8}
                viewBox="0 0 24 24"
                style={{ width: 16, height: 16, color: "currentColor" }}
              >
                <path d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </button>
          </div>
        </div>
      ) : (
        hasAmountInput && activeQuote && (
        <div className="mt-3 space-y-3">
          {/* Rate + slippage single line, directly below the swap button */}
          <div className="flex items-center justify-between text-[0.875rem] text-[var(--text-muted)]">
            <button
              onClick={() => setShowInverseRate((v) => !v)}
              className="flex items-center gap-1 hover:text-[var(--text)]"
            >
              {showInverseRate
                ? `1 ${tokenOut?.symbol} = ${(1 / activeQuote.rate).toFixed(6)} ${tokenIn?.symbol}`
                : `1 ${tokenIn?.symbol} = ${activeQuote.rate.toFixed(6)} ${tokenOut?.symbol}`}
            </button>
            <span className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-label={showDetails ? t("swap.hideDetails") : t("swap.showDetails")}
                className="text-[var(--text-muted)] transition group-hover:text-[var(--text)] hover:text-[var(--text)]"
              >
                {t("swap.slippage")}：
                {autoSlippage
                  ? `${t("swap.auto")} ${formatSlippage(effectiveSlippageBps)}%`
                  : `${formatSlippage(effectiveSlippageBps)}%`}
              </button>
              <button
                type="button"
                onClick={() => setShowDetails((v) => !v)}
                aria-label={showDetails ? t("swap.hideDetails") : t("swap.showDetails")}
                className="flex items-center text-[var(--text-muted)] transition group-hover:text-[var(--text)] hover:text-[var(--text)]"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  strokeWidth={8}
                  style={{
                    width: 16,
                    height: 16,
                    color: "currentColor",
                    transform: showDetails ? "rotate(90deg)" : "rotate(-90deg)",
                    transition: "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)",
                  }}
                >
                  <path
                    d="M15.7071 5.29289C16.0976 5.68342 16.0976 6.31658 15.7071 6.70711L10.4142 12L15.7071 17.2929C16.0976 17.6834 16.0976 18.3166 15.7071 18.7071C15.3166 19.0976 14.6834 19.0976 14.2929 18.7071L8.2929 12.7071C7.9024 12.3166 7.9024 11.6834 8.2929 11.2929L14.2929 5.29289C14.6834 4.90237 15.3166 4.90237 15.7071 5.29289Z"
                    fill="currentColor"
                    fillRule="evenodd"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </span>
          </div>

          {/* Detail card: minimum received / maximum paid, price impact — collapsible, hidden by default */}
          {showDetails && (
          <div className="space-y-1.5 rounded-radius px-4 py-3 text-xs bg-[var(--btn-bg)]">
            <>
              <Row
                label={isExactOut ? t("swap.maxPaid") : t("swap.minReceived")}
                hint={t("swap.minReceivedHint")}
                value={
                  "amountInMax" in activeQuote
                    ? `${formatAmount(activeQuote.amountInMax, tokenIn?.decimals ?? 18)} ${tokenIn?.symbol}`
                    : `${formatAmount(activeQuote.amountOutMin, tokenOut?.decimals ?? 18)} ${tokenOut?.symbol}`
                }
              />
                <Row
                  label={t("swap.priceImpact")}
                  hint={t("swap.priceImpactHint")}
                  value={
                    activeQuote.priceImpact != null
                      ? formatPriceImpact(activeQuote.priceImpact)
                      : "—"
                  }
                  color={
                    activeQuote.priceImpact != null
                      ? priceImpactColor(activeQuote.priceImpact)
                      : undefined
                  }
                />
                <Row
                  label={t("swap.tradingFee")}
                  hint={t("swap.tradingFeeHint")}
                  value={`${formatSlippage(SWAP_FEE_BPS)}%`}
                />

                {/* Swap route: BNB → USDT (direct) or BNB → BNB → USDT (via wrapped, shown as BNB) */}
                <div className="flex items-center justify-between gap-2">
                  <span className="flex shrink-0 items-center gap-1 text-[var(--text-muted)]">
                    {t("swap.route")}
                    <InfoTip text={t("swap.routeHint")} />
                  </span>
                  <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                    {activeQuote.path.map((addr, i) => {
                      const tk = buildRouteToken(addr, chainId, tokenIn, tokenOut);
                      return (
                        <Fragment key={`${addr}-${i}`}>
                          {i > 0 && (
                            <span className="text-[var(--text-muted)]">→</span>
                          )}
                          <span className="flex items-center gap-1 font-medium">
                            <TokenLogo token={tk} size={16} />
                            {tk.symbol}
                          </span>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              </>
          </div>
          )}
        </div>
        )
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

      {!isWrap && tokenIn && tokenOut && activeQuote && (
        <SwapConfirmModal
          open={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={() => {
            onConfirmDispatch();
          }}
          tokenIn={tokenIn}
          tokenOut={tokenOut}
          payValue={payValue}
          receiveValue={receiveValue}
          activeQuote={activeQuote}
          effectiveSlippageBps={effectiveSlippageBps}
          autoSlippage={autoSlippage}
          needsApproval={needsApproval}
          isBusy={busy || swapping}
        />
      )}
    </div>
  );
}

function InfoTip({ text }: { text: string }) {
  const [dismissed, setDismissed] = useState(false);
  return (
    <span className="relative group">
      <button
        type="button"
        onClick={() => setDismissed((v) => !v)}
        aria-label={text}
        className="flex items-center text-[#666a7a] transition hover:text-[#9aa0b0]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="8" r="0.6" fill="currentColor" />
        </svg>
      </button>
      <div
        className={clsx(
          "absolute left-0 z-30 w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-white/[0.08] bg-[#1e1e1e] p-2.5 text-xs leading-relaxed text-[#b8bccb] shadow-lg transition",
          "bottom-full mb-2 sm:bottom-auto sm:left-1/2 sm:top-full sm:-translate-x-1/2 sm:mt-2 sm:mb-0",
          dismissed
            ? "pointer-events-none opacity-0"
            : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        )}
      >
        {/* Mobile: tooltip above icon → arrow points down, aligned under icon */}
        <div className="absolute bottom-[-7px] left-0 border-x-[7px] border-x-transparent border-t-[7px] border-t-white/[0.08] sm:hidden" />
        <div className="absolute bottom-[-6px] left-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-[#1e1e1e] sm:hidden" />
        {/* Desktop: tooltip below icon → arrow points up, centered */}
        <div className="absolute top-[-7px] left-1/2 hidden -translate-x-1/2 border-x-[7px] border-x-transparent border-b-[7px] border-b-white/[0.08] sm:block" />
        <div className="absolute top-[-6px] left-1/2 hidden -translate-x-1/2 border-x-[6px] border-x-transparent border-b-[6px] border-b-[#1e1e1e] sm:block" />
        {text}
      </div>
    </span>
  );
}

function Row({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1 text-[var(--text-muted)]">
        {label}
        {hint && <InfoTip text={hint} />}
      </span>
      <span className="font-medium" style={color ? { color } : undefined}>
        {value}
      </span>
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
        className="flex shrink-0 items-center gap-1 rounded-full bg-brand-gradient px-4 py-2 text-sm font-semibold text-[#0b0b14] transition hover:brightness-105"
      >
        {t("swap.selectToken")}
        <svg viewBox="0 0 24 24" fill="none" strokeWidth={8} style={{ width: 18, height: 18, color: "rgba(11,11,20,0.7)", transform: "rotate(-90deg)" }}>
          <path d="M15.7071 5.29289C16.0976 5.68342 16.0976 6.31658 15.7071 6.70711L10.4142 12L15.7071 17.2929C16.0976 17.6834 16.0976 18.3166 15.7071 18.7071C15.3166 19.0976 14.6834 19.0976 14.2929 18.7071L8.2929 12.7071C7.9024 12.3166 7.9024 11.6834 8.2929 11.2929L14.2929 5.29289C14.6834 4.90237 15.3166 4.90237 15.7071 5.29289Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
        </svg>
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-full bg-sym-select py-1.5 pl-1.5 pr-3 transition"
    >
      <TokenLogo token={token} size={28} />
      <span className="text-base font-medium text-[var(--text)]">{token.symbol}</span>
      <svg viewBox="0 0 24 24" fill="none" strokeWidth={8} style={{ width: 18, height: 18, color: "var(--text-muted)", transform: "rotate(-90deg)" }}>
        <path d="M15.7071 5.29289C16.0976 5.68342 16.0976 6.31658 15.7071 6.70711L10.4142 12L15.7071 17.2929C16.0976 17.6834 16.0976 18.3166 15.7071 18.7071C15.3166 19.0976 14.6834 19.0976 14.2929 18.7071L8.2929 12.7071C7.9024 12.3166 7.9024 11.6834 8.2929 11.2929L14.2929 5.29289C14.6834 4.90237 15.3166 4.90237 15.7071 5.29289Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd" />
      </svg>
    </button>
  );
}
