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
import { FACTORY_ABI } from "@/config/abis/factory";
import { ROUTER_ABI } from "@/config/abis/router";
import {
  buildPaths,
  computeMaxAmountIn,
  computeAutoSlippageBps,
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
  amountOutWei: bigint
): Promise<Omit<SwapQuoteOut, "slippageBps"> | null> {
  const paths = buildPaths(tokenIn, tokenOut, wnative);

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
      if (inWei > 0n) {
        const rate = effectiveRate(
          inWei,
          amountOutWei,
          tokenIn.decimals,
          tokenOut.decimals
        );
        return { amountIn: inWei, amountInMax: inWei, path, rate };
      }
    } catch {
      // path not tradeable through this router
    }
  }
  return null;
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
      !!amountOut &&
      parseFloat(amountOut) > 0,
    staleTime: 10_000,
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

      let quote =
        (await quoteWithRouterOut(
          publicClient,
          routerP,
          factoryP,
          wnative,
          tokenIn,
          tokenOut,
          amountOutWei
        )) ??
        (routerS !== routerP
          ? await quoteWithRouterOut(
              publicClient,
              routerS,
              factoryS,
              wnative,
              tokenIn,
              tokenOut,
              amountOutWei
            )
          : null);

      if (!quote) return null;

      // Single-hop price impact using pool reserves (path direction is [in, out]).
      let priceImpact: number | undefined;
      if (quote.path.length === 2) {
        try {
          const pair = await publicClient.readContract({
            address: factoryP,
            abi: FACTORY_ABI,
            functionName: "getPair",
            args: [quote.path[0], quote.path[1]],
          });
          if (pair && pair !== "0x0000000000000000000000000000000000000000") {
            const [reserve0, reserve1] = await publicClient.readContract({
              address: pair as Address,
              abi: [
                {
                  type: "function",
                  name: "getReserves",
                  stateMutability: "view",
                  inputs: [],
                  outputs: [
                    { name: "reserve0", type: "uint112" },
                    { name: "reserve1", type: "uint112" },
                    { name: "blockTimestampLast", type: "uint32" },
                  ],
                },
              ],
              functionName: "getReserves",
            });
            const token0 = await publicClient.readContract({
              address: pair as Address,
              abi: [
                {
                  type: "function",
                  name: "token0",
                  stateMutability: "view",
                  inputs: [],
                  outputs: [{ name: "", type: "address" }],
                },
              ],
              functionName: "token0",
            });
            const inIsToken0 =
              (token0 as Address).toLowerCase() === quote.path[0].toLowerCase();
            const reserveIn = inIsToken0 ? reserve0 : reserve1;
            const reserveOut = inIsToken0 ? reserve1 : reserve0;
            const mid =
              Number(reserveOut) / 10 ** tokenOut.decimals /
              (Number(reserveIn) / 10 ** tokenIn.decimals);
            if (mid > 0) priceImpact = (mid - quote.rate) / mid;
          }
        } catch {
          // ignore impact calc errors
        }
      }

      // Resolve the effective slippage: auto derives it from the live price
      // impact (clamped to [0.5%, 5%]); manual uses the user's fixed value.
      const effectiveBps = autoSlippage
        ? computeAutoSlippageBps(priceImpact)
        : slippageBps;
      const amountInMax = computeMaxAmountIn(quote.amountIn, effectiveBps);

      return { ...quote, amountInMax, priceImpact, slippageBps: effectiveBps };
    },
  });
}
