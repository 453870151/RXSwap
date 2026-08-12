"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import type { SwapToken } from "@/config/tokens";
import {
  getRouterAddresses,
  getFactoryAddresses,
  WNATIVE,
} from "@/config/contracts";
import {
  computeMaxAmountIn,
  computeAutoSlippageBps,
  findBestRoute,
  ZERO_ADDRESS,
  type Address,
} from "@/lib/swap";

export interface SwapQuoteOut {
  /** Exact amount of tokenIn required to receive `amountOut`. */
  amountIn: bigint;
  /** amountIn inflated by slippage — the cap sent on-chain (amountInMax). */
  amountInMax: bigint;
  path: Address[];
  rate: number;
  priceImpact?: number;
  /** Effective slippage used for amountInMax (auto or manual). */
  slippageBps: number;
  /** Router that produced this quote (primary or secondary). */
  router: Address;
}

interface QuoteOutParams {
  tokenIn: SwapToken | undefined;
  tokenOut: SwapToken | undefined;
  amountOut: string;
  slippageBps: number;
  autoSlippage: boolean;
  chainId: number | undefined;
}

// Route resolution is shared with the exact-in hook via `findBestRoute`
// in @/lib/swap (batched multicall + primary-first fallback).

export function useSwapQuoteOut({
  tokenIn,
  tokenOut,
  amountOut,
  slippageBps,
  autoSlippage,
  chainId,
}: QuoteOutParams) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: [
      "swap-quote-out",
      chainId,
      tokenIn?.address,
      tokenOut?.address,
      amountOut,
      autoSlippage,
      slippageBps,
    ],
    enabled:
      !!publicClient &&
      !!tokenIn &&
      !!tokenOut &&
      tokenIn.address !== tokenOut.address &&
      //! A transfer-fee / tax / reflection token cannot be swapped in
      //! exact-output mode — the router's SupportingFeeOnTransferTokens family
      //! has no ForExactTokens variant. The UI forces exact-in for these pairs,
      //! so this reverse quote must never run for them.
      !tokenIn.isFeeOnTransfer &&
      !tokenOut.isFeeOnTransfer &&
      !!amountOut &&
      parseFloat(amountOut) > 0,
    staleTime: 10_000,
    // Poll the chain every 5s while an amount is entered so the displayed
    // Token1 (amountInMax) tracks live reserves instead of going stale.
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<(SwapQuoteOut & { amountInMax: bigint }) | null> => {
      if (!publicClient || !tokenIn || !tokenOut) return null;
      let amountOutWei: bigint;
      try {
        amountOutWei = parseUnits(amountOut, tokenOut.decimals);
      } catch {
        return null;
      }
      if (amountOutWei <= 0n) return null;

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
      // primary already has liquidity.
      const quoteP = await findBestRoute({
        publicClient,
        router: routerP,
        factory: factoryP,
        wnative,
        tokenIn,
        tokenOut,
        amountWei: amountOutWei,
        chainId: chainId as number,
        mode: "exactOut",
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
              amountWei: amountOutWei,
              chainId: chainId as number,
              mode: "exactOut",
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
      const amountInMax = computeMaxAmountIn(quote.amountIn, effectiveBps);

      return { ...quote, amountInMax, slippageBps: effectiveBps };
    },
  });
}
