"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseUnits } from "viem";
import type { SwapToken } from "@/config/tokens";
import {
  getRouterAddresses,
  getFactoryAddresses,
  WNATIVE,
} from "@/config/contracts";
import {
  computeMinAmountOut,
  computeAutoSlippageBps,
  findBestRoute,
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

// Route resolution is shared with the exact-out hook via `findBestRoute`
// in @/lib/swap (batched multicall + primary-first fallback).

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

      // Primary-first auto-router: quote the primary router, and only fall
      // back to the secondary router when the primary yields no route. This
      // avoids running the full path-search fan-out on BOTH routers when the
      // primary already has liquidity (the common case on production chains).
      const quoteP = await findBestRoute({
        publicClient,
        router: routerP,
        factory: factoryP,
        wnative,
        tokenIn,
        tokenOut,
        amountWei: amountInWei,
        chainId: chainId as number,
        mode: "exactIn",
      });
      const quoteS =
        !quoteP && routerS !== routerP && routerS !== ZERO_ADDRESS && factoryS !== ZERO_ADDRESS
          ? await findBestRoute({
              publicClient,
              router: routerS,
              factory: factoryS,
              wnative,
              tokenIn,
              tokenOut,
              amountWei: amountInWei,
              chainId: chainId as number,
              mode: "exactIn",
            })
          : null;

      const quote = quoteP ?? quoteS;

      if (!quote) return null;

      // Resolve the effective slippage: auto derives it from the live price
      // impact (clamped to [0.5%, 5%]); manual uses the user's fixed value.
      // priceImpact is already computed (per-hop compounded) inside
      // findBestRoute, so it's valid for both direct and bridged routes.
      const effectiveBps = autoSlippage
        ? computeAutoSlippageBps(quote.priceImpact)
        : slippageBps;
      const amountOutMin = computeMinAmountOut(quote.amountOut, effectiveBps);

      return { ...quote, amountOutMin, slippageBps: effectiveBps };
    },
  });
}
