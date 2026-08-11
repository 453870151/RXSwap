"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseUnits, formatUnits } from "viem";
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
  computeMaxAmountIn,
  computeAutoSlippageBps,
  computePathPriceImpact,
  effectiveRate,
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

// Mirror of quoteWithRouter but for the EXACT-OUT direction: given a desired
// output amount, resolve the required input amount via router.getAmountsIn.
async function quoteWithRouterOut(
  publicClient: any,
  router: Address,
  factory: Address,
  wnative: Address,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountOutWei: bigint,
  chainId: number
): Promise<Omit<SwapQuoteOut, "slippageBps"> | null> {
  const paths = buildPaths(tokenIn, tokenOut, wnative, getTokenList(chainId));

  // Visit every candidate path and keep the one requiring the LEAST input
  // (best price), so an indirect route is chosen only when it beats the direct.
  let best: Omit<SwapQuoteOut, "slippageBps"> | null = null;
  for (const path of paths) {
    // 1) Verify every adjacent pair exists in this factory.
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

    // 2) Get amounts in for the valid path (reverse of getAmountsOut).
    try {
      const amounts = await publicClient.readContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: "getAmountsIn",
        args: [amountOutWei, path],
      });
      const inWei = amounts[0] as bigint;
      if (inWei > 0n && (!best || inWei < best.amountIn)) {
        const rate = effectiveRate(
          inWei,
          amountOutWei,
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
        best = { amountIn: inWei, amountInMax: inWei, path, rate, priceImpact, router };
      }
    } catch {
      // path not tradeable through this router
    }
  }
  return best;
}

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

      // Query both routers and pick the one requiring the least input. If the
      // primary pair has been almost drained, its required input can spike; we
      // must not prefer it over a healthy secondary pair.
      const quoteP = await quoteWithRouterOut(
        publicClient,
        routerP,
        factoryP,
        wnative,
        tokenIn,
        tokenOut,
        amountOutWei,
        chainId as number
      );
      const quoteS =
        routerS !== routerP
          ? await quoteWithRouterOut(
              publicClient,
              routerS,
              factoryS,
              wnative,
              tokenIn,
              tokenOut,
              amountOutWei,
              chainId as number
            )
          : null;

      let quote: Omit<SwapQuoteOut, "slippageBps"> | null = quoteP ?? quoteS;
      if (quoteS && quoteP) {
        quote = quoteS.amountIn < quoteP.amountIn ? quoteS : quoteP;
      }

      if (!quote) return null;

      // Resolve the effective slippage: auto derives it from the live price
      // impact (clamped to [0.5%, 5%]); manual uses the user's fixed value.
      // priceImpact is already computed (per-hop compounded) inside
      // quoteWithRouterOut, so it's valid for both direct and bridged routes.
      const effectiveBps = autoSlippage
        ? computeAutoSlippageBps(quote.priceImpact)
        : slippageBps;
      const amountInMax = computeMaxAmountIn(quote.amountIn, effectiveBps);

      return { ...quote, amountInMax, slippageBps: effectiveBps };
    },
  });
}
