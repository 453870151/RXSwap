"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseUnits } from "viem";
import type { SwapToken } from "@/config/tokens";
import { getTokenList } from "@/config/tokens";
import {
  getRouterAddresses,
  getFactoryAddresses,
  WNATIVE,
} from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { ROUTER_ABI } from "@/config/abis/router";
import {
  buildPaths,
  computeMinAmountOut,
  computeAutoSlippageBps,
  computePathPriceImpact,
  effectiveRate,
  ZERO_ADDRESS,
  type Address,
} from "@/lib/swap";

export interface SwapQuote {
  amountOut: bigint;
  amountOutMin: bigint;
  path: Address[];
  rate: number;
  priceImpact?: number;
  /** Effective slippage used for amountOutMin (auto or manual). */
  slippageBps: number;
  /** Router that produced this quote (primary or secondary). */
  router: Address;
}

interface QuoteParams {
  tokenIn: SwapToken | undefined;
  tokenOut: SwapToken | undefined;
  amountIn: string;
  slippageBps: number;
  autoSlippage: boolean;
  chainId: number | undefined;
}

async function quoteWithRouter(
  publicClient: any,
  router: Address,
  factory: Address,
  wnative: Address,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountInWei: bigint,
  chainId: number
): Promise<Omit<SwapQuote, "slippageBps"> | null> {
  const paths = buildPaths(tokenIn, tokenOut, wnative, getTokenList(chainId));

  // 1) Verify every adjacent pair exists in this factory.
  let best: Omit<SwapQuote, "slippageBps"> | null = null;
  for (const path of paths) {
    const pairChecks = await Promise.all(
      path.slice(0, -1).map((_, i) =>
        publicClient.readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: "getPair",
          args: [path[i], path[i + 1]],
        })
      )
    );
    const exists = pairChecks.every(
      (p: Address) => p && p !== "0x0000000000000000000000000000000000000000"
    );
    if (!exists) continue;

    // 2) Get amounts out for the valid path.
    try {
      // Input tax: a transfer-fee token deducts `transferFeeBps` on the way in,
      // so the router only receives `amountIn * (1 - fee)`. Quoting with the
      // gross amount overestimates the output, making the displayed "received"
      // optimistic. Discount the input used for the quote so it matches what
      // actually reaches the pair. The on-chain swap still sells the gross
      // `amountInWei`; only the displayed quote is corrected here.
      const inFeeBps = tokenIn.transferFeeBps ?? 0;
      const amountInForQuote =
        inFeeBps > 0
          ? (amountInWei * BigInt(10000 - inFeeBps)) / 10000n
          : amountInWei;
      const amounts = await publicClient.readContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInForQuote, path],
      });
      const out = amounts[amounts.length - 1] as bigint;
      // Fee-on-transfer output tokens deduct a transfer fee on the way out, so
      // the amount the user actually receives is `out * (1 - fee)`. Discounting
      // here keeps the displayed "received" and the on-chain `amountOutMin`
      // honest; otherwise the quote is optimistic and a high tax can revert the
      // SupportingFeeOnTransferTokens swap (real received < amountOutMin).
      const feeBps = tokenOut.transferFeeBps ?? 0;
      const netOut =
        feeBps > 0 ? (out * BigInt(10000 - feeBps)) / 10000n : out;
      if (netOut > 0n && (!best || netOut > best.amountOut)) {
        const minOut = computeMinAmountOut(netOut, 0); // slippage applied by caller
        const rate = effectiveRate(
          amountInWei,
          netOut,
          tokenIn.decimals,
          tokenOut.decimals
        );
        // Compound price impact across all hops of this path (direct or
        // bridged), so the "—" placeholder never shows for a real quote.
        const priceImpact = await computePathPriceImpact(
          publicClient,
          factory,
          path,
          amounts as readonly bigint[]
        );
        best = { amountOut: netOut, amountOutMin: minOut, path, rate, priceImpact, router };
      }
    } catch {
      // path not tradeable through this router
    }
  }
  return best;
}

export function useSwapQuote({
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
  autoSlippage,
  chainId,
}: QuoteParams) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: [
      "swap-quote",
      chainId,
      tokenIn?.address,
      tokenOut?.address,
      amountIn,
      autoSlippage,
      slippageBps,
    ],
    enabled:
      !!publicClient &&
      !!tokenIn &&
      !!tokenOut &&
      tokenIn.address !== tokenOut.address &&
      !!amountIn &&
      parseFloat(amountIn) > 0,
    staleTime: 10_000,
    // Poll the chain every 5s while an amount is entered so the displayed
    // Token2 tracks live reserves (price drift) instead of going stale.
    // Only runs while `enabled` is true and the tab is focused (default
    // refetchIntervalInBackground: false), so it costs nothing when idle.
    refetchInterval: 5_000,
    // Bound the retry storm: a single transient RPC failure retries once
    // instead of the default 3 with exponential backoff, which otherwise
    // pins isFetching (button stuck on "confirming") for ~70s.
    retry: 1,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<(SwapQuote & { amountOutMin: bigint }) | null> => {
      if (!publicClient || !tokenIn || !tokenOut) return null;
      let amountInWei: bigint;
      try {
        amountInWei = parseUnits(amountIn, tokenIn.decimals);
      } catch {
        return null;
      }
      if (amountInWei <= 0n) return null;

      const wnative = WNATIVE[chainId as number];
      const { primary: routerP, secondary: routerS } = getRouterAddresses(
        chainId as number
      );
      const { primary: factoryP, secondary: factoryS } = getFactoryAddresses(
        chainId as number
      );

      // Query both routers and pick the best output. If the primary pair has
      // been almost drained, its output can be near-zero; we must not blindly
      // prefer it over a healthy secondary pair.
      const quoteP = await quoteWithRouter(
        publicClient,
        routerP,
        factoryP,
        wnative,
        tokenIn,
        tokenOut,
        amountInWei,
        chainId as number
      );
      const quoteS =
        routerS !== routerP &&
        routerS !== ZERO_ADDRESS &&
        factoryS !== ZERO_ADDRESS
          ? await quoteWithRouter(
              publicClient,
              routerS,
              factoryS,
              wnative,
              tokenIn,
              tokenOut,
              amountInWei,
              chainId as number
            )
          : null;

      let quote: Omit<SwapQuote, "slippageBps"> | null = quoteP ?? quoteS;
      if (quoteS && quoteP) {
        quote = quoteS.amountOut > quoteP.amountOut ? quoteS : quoteP;
      }

      if (!quote) return null;

      // Resolve the effective slippage: auto derives it from the live price
      // impact (clamped to [0.5%, 5%]); manual uses the user's fixed value.
      // priceImpact is already computed (per-hop compounded) inside
      // quoteWithRouter, so it's valid for both direct and bridged routes.
      const effectiveBps = autoSlippage
        ? computeAutoSlippageBps(quote.priceImpact)
        : slippageBps;
      const amountOutMin = computeMinAmountOut(quote.amountOut, effectiveBps);

      return { ...quote, amountOutMin, slippageBps: effectiveBps };
    },
  });
}
