"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { SwapToken } from "@/config/tokens";
import { getFactoryAddresses, WNATIVE } from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { PAIR_ABI } from "@/config/abis/pair";
import { parseUnits } from "viem";
import type { Address } from "@/lib/swap";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

export interface PairReserves {
  exists: boolean;
  pair: Address | null;
  reserve0: bigint;
  reserve1: bigint;
  token0: Address | null;
  token1: Address | null;
  totalSupply: bigint;
}

export function usePairReserves(
  tokenA: SwapToken | undefined,
  tokenB: SwapToken | undefined,
  chainId: number | undefined
) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["pair-reserves", chainId, tokenA?.address, tokenB?.address],
    enabled: !!publicClient && !!tokenA && !!tokenB && !!chainId,
    staleTime: 12_000,
    queryFn: async (): Promise<PairReserves> => {
      if (!publicClient || !tokenA || !tokenB || !chainId)
        return empty();
      const { primary: factory } = getFactoryAddresses(chainId);
      // PancakeSwap V2 pairs only hold ERC-20 tokens; a native coin (e.g. tBNB)
      // is wrapped as WNATIVE on chain, so we must query getPair with the
      // wrapped address, not the zero-address placeholder used by the UI.
      const wnative = WNATIVE[chainId];
      const addrA =
        tokenA.isNative && wnative ? (wnative as Address) : tokenA.address;
      const addrB =
        tokenB.isNative && wnative ? (wnative as Address) : tokenB.address;
      const pair = (await publicClient
        .readContract({
          address: factory,
          abi: FACTORY_ABI,
          functionName: "getPair",
          args: [addrA, addrB],
        })
        .catch(() => ZERO)) as Address;
      if (!pair || pair === ZERO) return empty();

      const [reserves, totalSupply, t0, t1] = await Promise.all([
        publicClient.readContract({
          address: pair,
          abi: PAIR_ABI,
          functionName: "getReserves",
        }),
        publicClient.readContract({
          address: pair,
          abi: PAIR_ABI,
          functionName: "totalSupply",
        }),
        publicClient.readContract({
          address: pair,
          abi: PAIR_ABI,
          functionName: "token0",
        }),
        publicClient.readContract({
          address: pair,
          abi: PAIR_ABI,
          functionName: "token1",
        }),
      ]);
      // Map the wrapped-native address back to the zero-address placeholder so
      // downstream comparisons (tokenA.address === reserve.token0) keep matching.
      const mapNative = (a: Address): Address =>
        wnative && a.toLowerCase() === wnative.toLowerCase() ? ZERO : a;
      const [reserve0, reserve1] = reserves as [bigint, bigint, number];
      return {
        exists: true,
        pair,
        reserve0,
        reserve1,
        token0: mapNative(t0 as Address),
        token1: mapNative(t1 as Address),
        totalSupply: totalSupply as bigint,
      };
    },
  });
}

function empty(): PairReserves {
  return {
    exists: false,
    pair: null,
    reserve0: 0n,
    reserve1: 0n,
    token0: null,
    token1: null,
    totalSupply: 0n,
  };
}

/**
 * Given an amount entered for one side, compute the balanced amount for the
 * other side using pool ratio (reserve of input / reserve of output).
 */
export function balancedOtherSide(
  amountInStr: string,
  inToken: SwapToken,
  outToken: SwapToken,
  reserves: PairReserves
): string {
  if (!reserves.exists || !reserves.token0 || !reserves.token1) return "";
  try {
    const amountIn = parseUnits(amountInStr, inToken.decimals);
    if (amountIn <= 0n) return "";
    const inIsToken0 =
      reserves.token0.toLowerCase() === inToken.address.toLowerCase();
    const reserveIn = inIsToken0 ? reserves.reserve0 : reserves.reserve1;
    const reserveOut = inIsToken0 ? reserves.reserve1 : reserves.reserve0;
    if (reserveIn <= 0n) return "";
    const outRaw = (amountIn * reserveOut) / reserveIn;
    return outRaw.toString();
  } catch {
    return "";
  }
}
