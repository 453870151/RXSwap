"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { parseUnits } from "viem";
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
  computeMinAmountOut,
  effectiveRate,
  type Address,
} from "@/lib/swap";

export interface SwapQuote {
  amountOut: bigint;
  amountOutMin: bigint;
  path: Address[];
  rate: number;
  priceImpact?: number;
}

interface QuoteParams {
  tokenIn: SwapToken | undefined;
  tokenOut: SwapToken | undefined;
  amountIn: string;
  slippageBps: number;
  chainId: number | undefined;
}

async function quoteWithRouter(
  publicClient: any,
  router: Address,
  factory: Address,
  wnative: Address,
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  amountInWei: bigint
): Promise<SwapQuote | null> {
  const paths = buildPaths(tokenIn, tokenOut, wnative);

  // 1) Verify every adjacent pair exists in this factory.
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
      const amounts = await publicClient.readContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInWei, path],
      });
      const out = amounts[amounts.length - 1] as bigint;
      if (out > 0n) {
        const minOut = computeMinAmountOut(out, 0); // slippage applied by caller
        const rate = effectiveRate(
          amountInWei,
          out,
          tokenIn.decimals,
          tokenOut.decimals
        );
        return { amountOut: out, amountOutMin: minOut, path, rate };
      }
    } catch {
      // path not tradeable through this router
    }
  }
  return null;
}

export function useSwapQuote({
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
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

      // Primary router first; fall back to secondary if no tradeable path.
      let quote =
        (await quoteWithRouter(
          publicClient,
          routerP,
          factoryP,
          wnative,
          tokenIn,
          tokenOut,
          amountInWei
        )) ??
        (routerS !== routerP
          ? await quoteWithRouter(
              publicClient,
              routerS,
              factoryS,
              wnative,
              tokenIn,
              tokenOut,
              amountInWei
            )
          : null);

      if (!quote) return null;

      const amountOutMin = computeMinAmountOut(quote.amountOut, slippageBps);

      // Single-hop price impact using pool reserves.
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

      return { ...quote, amountOutMin, priceImpact };
    },
  });
}
