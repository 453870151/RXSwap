"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getTokenList, getTokenByAddress, getNativeToken, type SwapToken } from "@/config/tokens";
import { getFactoryAddresses, WNATIVE } from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { PAIR_ABI } from "@/config/abis/pair";
import type { Address } from "@/lib/swap";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/**
 * On-chain, native liquidity lives in a WNATIVE pair (the router wraps BNB on
 * add). The token list represents the native asset with a zero-address
 * placeholder, so we must translate it to the real wrapped-native contract when
 * asking the factory for a pair — otherwise every "BNB + X" LP is missed.
 */
function pairAddress(token: SwapToken, chainId: number): Address {
  return token.isNative ? WNATIVE[chainId] : token.address;
}

/**
 * Map a pair's token0/token1 address back into a display token. Treats the
 * wrapped-native contract as the native asset so WBNB-based pairs render as BNB.
 */
function resolveToken(chainId: number, address: Address): SwapToken | undefined {
  const wnative = WNATIVE[chainId];
  if (address.toLowerCase() === wnative.toLowerCase()) {
    return getNativeToken(chainId);
  }
  return getTokenByAddress(chainId, address);
}

export interface LiquidityPosition {
  pair: Address;
  lpBalance: bigint;
  tokenA: SwapToken;
  tokenB: SwapToken;
  amountA: bigint;
  amountB: bigint;
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
  share: number;
}

/** Unique unordered pairs from the token list. */
function uniquePairs(tokens: SwapToken[]): [SwapToken, SwapToken][] {
  const pairs: [SwapToken, SwapToken][] = [];
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      pairs.push([tokens[i], tokens[j]]);
    }
  }
  return pairs;
}

/**
 * Wallet liquidity list — on-chain only, no API.
 * Strategy: cross-query the known token list. For every pair of listed tokens,
 * check factory.getPair; for existing pairs, read the wallet's LP balance; for
 * positions > 0, fetch reserves + total supply and derive underlying amounts.
 */
export function useLiquidityPositions(
  account: Address | undefined,
  chainId: number | undefined
) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["liquidity-positions", chainId, account],
    enabled: !!publicClient && !!account && !!chainId,
    staleTime: 15_000,
    queryFn: async (): Promise<LiquidityPosition[]> => {
      if (!publicClient || !account || !chainId) return [];
      const tokens = getTokenList(chainId);
      const { primary: factory } = getFactoryAddresses(chainId);
      const pairs = uniquePairs(tokens);

      // 1) Find existing pairs.
      const pairResults = await Promise.all(
        pairs.map(([a, b]) =>
          publicClient
            .readContract({
              address: factory,
              abi: FACTORY_ABI,
              functionName: "getPair",
              args: [pairAddress(a, chainId), pairAddress(b, chainId)],
            })
            .catch(() => ZERO)
        )
      );

      const existing = pairs
        .map((p, i) => ({ p, pair: pairResults[i] as Address }))
        .filter(({ pair }) => pair && pair !== ZERO);

      if (existing.length === 0) return [];

      // 2) Wallet LP balance for each existing pair.
      const balances = await Promise.all(
        existing.map(({ pair }) =>
          publicClient
            .readContract({
              address: pair,
              abi: PAIR_ABI,
              functionName: "balanceOf",
              args: [account],
            })
            .catch(() => 0n)
        )
      );

      const withBalance = existing
        .map((e, i) => ({ ...e, lpBalance: balances[i] as bigint }))
        .filter((e) => e.lpBalance > 0n);

      if (withBalance.length === 0) return [];

      // 3) Reserves, total supply, token ordering for each position.
      const details = await Promise.all(
        withBalance.map(async ({ p, pair, lpBalance }) => {
          try {
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
            const [reserve0, reserve1] = reserves as [bigint, bigint, number];
            const tokenA = resolveToken(chainId, t0 as Address);
            const tokenB = resolveToken(chainId, t1 as Address);
            if (!tokenA || !tokenB) return null;
            const ts = totalSupply as bigint;
            const amountA = (lpBalance * reserve0) / ts;
            const amountB = (lpBalance * reserve1) / ts;
            const share =
              ts > 0n ? Number((lpBalance * 10000n) / ts) / 10000 : 0;
            return {
              pair,
              lpBalance,
              tokenA,
              tokenB,
              amountA,
              amountB,
              reserveA: reserve0,
              reserveB: reserve1,
              totalSupply: ts,
              share,
            } as LiquidityPosition;
          } catch {
            return null;
          }
        })
      );

      return details.filter((d): d is LiquidityPosition => d !== null);
    },
  });
}
