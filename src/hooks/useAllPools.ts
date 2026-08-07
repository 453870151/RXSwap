"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import {
  getTokenList,
  getNativeToken,
  getTokenByAddress,
  type SwapToken,
} from "@/config/tokens";
import { getFactoryAddresses, getRouterAddresses, WNATIVE } from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { PAIR_ABI } from "@/config/abis/pair";
import { valueToStable } from "@/hooks/useWalletUsdValues";
import type { Address } from "@/lib/swap";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// Safety cap so a chain with an absurd number of pairs can't lock the UI in a
// multi-minute RPC storm. Real DEXes sit well under this; raise if needed.
const MAX_PAIRS = 5000;

// Cap rendered pool cards so a chain with thousands of pairs doesn't blow up
// the DOM. Data is still fetched/ranked in full; only rendering is truncated.
// Exported so the pricing query slices the exact same displayed set.
export const DISPLAY_CAP = 200;

export interface AllPool {
  pair: Address;
  tokenA: SwapToken; // token0 (reserve-ordered)
  tokenB: SwapToken; // token1 (reserve-ordered)
  reserveA: bigint;
  reserveB: bigint;
  totalSupply: bigint;
}

// Display token for a pair's underlying address: WNATIVE maps to the native
// asset (BNB), listed tokens resolve normally, and anything else (unlisted
// ERC-20) falls back to a generated badge so the card still renders.
function resolvePoolToken(chainId: number, address: Address): SwapToken {
  const wnative = WNATIVE[chainId];
  if (address.toLowerCase() === wnative.toLowerCase()) {
    return getNativeToken(chainId);
  }
  const listed = getTokenByAddress(chainId, address);
  if (listed) return listed;
  return {
    address,
    symbol: `${address.slice(0, 4)}…${address.slice(-2)}`,
    name: address,
    decimals: 18,
    chainId,
    isNative: false,
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Run `fn` over `items` with at most `limit` concurrent executions, preserving
// order. Keeps the RPC from being hammered by hundreds of simultaneous
// multicalls (which a public testnet endpoint would rate-limit).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * All on-chain liquidity pools via factory.allPairsLength / allPairs. For each
 * pair we read reserves + total supply + the two underlying tokens. **No pricing
 * is done here** — this resolves fast (multicall-batched enumeration only) so
 * the list can paint immediately; USD values are filled in by useAllPoolPrices.
 * Pools are pre-sorted by LP total supply (available without prices) so the
 * initial paint already shows the biggest pools first.
 */
export function useAllPools(chainId: number | undefined) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["all-pools", chainId],
    enabled: !!publicClient && !!chainId,
    staleTime: 30_000,
    queryFn: async (): Promise<AllPool[]> => {
      if (!publicClient || !chainId) return [];
      const { primary: factory } = getFactoryAddresses(chainId);

      // 1) How many pairs exist.
      const lengthRaw = await publicClient.readContract({
        address: factory,
        abi: FACTORY_ABI,
        functionName: "allPairsLength",
      });
      const total = Math.min(Number(lengthRaw as bigint), MAX_PAIRS);
      if (total === 0) return [];

      // 2) Enumerate pair addresses (batched multicall).
      const indices = Array.from({ length: total }, (_, i) => i);
      const pairAddresses: Address[] = [];
      for (const batch of chunk(indices, 200)) {
        const res = await publicClient.multicall({
          contracts: batch.map((i) => ({
            address: factory,
            abi: FACTORY_ABI,
            functionName: "allPairs",
            args: [BigInt(i)],
          })),
        });
        for (const r of res) {
          if (r.status === "success" && r.result) {
            pairAddresses.push(r.result as unknown as Address);
          }
        }
      }
      if (pairAddresses.length === 0) return [];

      // 3) Per-pair details: getReserves, totalSupply, token0, token1.
      //    ~50 pairs (200 calls) per multicall batch.
      const details: {
        pair: Address;
        reserve0: bigint;
        reserve1: bigint;
        totalSupply: bigint;
        token0: Address;
        token1: Address;
      }[] = [];
      for (const batch of chunk(pairAddresses, 50)) {
        const contracts = batch.flatMap((pair) => [
          { address: pair, abi: PAIR_ABI, functionName: "getReserves" },
          { address: pair, abi: PAIR_ABI, functionName: "totalSupply" },
          { address: pair, abi: PAIR_ABI, functionName: "token0" },
          { address: pair, abi: PAIR_ABI, functionName: "token1" },
        ]);
        const res = await publicClient.multicall({ contracts });
        batch.forEach((pair, bi) => {
          const base = bi * 4;
          const r0 = res[base];
          const r1 = res[base + 1];
          const r2 = res[base + 2];
          const r3 = res[base + 3];
          if (
            r0?.status === "success" &&
            r1?.status === "success" &&
            r2?.status === "success" &&
            r3?.status === "success"
          ) {
            const reserves = r0.result as [bigint, bigint, number];
            details.push({
              pair,
              reserve0: reserves[0],
              reserve1: reserves[1],
              totalSupply: r1.result as bigint,
              token0: r2.result as Address,
              token1: r3.result as Address,
            });
          }
        });
      }
      if (details.length === 0) return [];

      // 4) Resolve tokens (cheap, cached locally).
      const tokenCache = new Map<string, SwapToken>();
      const getToken = (addr: Address) => {
        const key = addr.toLowerCase();
        let tk = tokenCache.get(key);
        if (!tk) {
          tk = resolvePoolToken(chainId, addr);
          tokenCache.set(key, tk);
        }
        return tk;
      };
      const pools: AllPool[] = details.map((d) => ({
        pair: d.pair,
        tokenA: getToken(d.token0),
        tokenB: getToken(d.token1),
        reserveA: d.reserve0,
        reserveB: d.reserve1,
        totalSupply: d.totalSupply,
      }));

      // Initial display order by LP total supply (no price needed, stable).
      pools.sort((a, b) => Number(b.totalSupply - a.totalSupply));
      return pools;
    },
  });
}

/**
 * Prices the unique tokens of the pools we actually render (top DISPLAY_CAP by
 * total supply), in parallel with a concurrency cap, and returns a Map keyed by
 * lowercase token address → USD per whole token (null = no on-chain route to a
 * stablecoin). Runs only after the basic list is available, so the list paints
 * first and values "pop in" when this resolves.
 */
export function useAllPoolPrices(
  chainId: number | undefined,
  pools: AllPool[] | undefined
) {
  const publicClient = usePublicClient({ chainId });

  const priceKey =
    pools && pools.length > 0
      ? pools
          .slice(0, DISPLAY_CAP)
          .map((p) => p.tokenA.address + p.tokenB.address)
          .join(",")
      : "";

  return useQuery({
    queryKey: ["all-pools-prices", chainId, priceKey],
    enabled: !!publicClient && !!chainId && !!pools && pools.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, number | null>> => {
      if (!publicClient || !chainId || !pools) return new Map();
      const { primary: factory } = getFactoryAddresses(chainId);
      const { primary: routerP, secondary: routerS } = getRouterAddresses(chainId);
      const wnative = WNATIVE[chainId];
      const stable = getTokenList(chainId).find(
        (t) =>
          !t.isNative &&
          ["USDT", "USDC", "USD", "DAI", "BUSD"].includes(t.symbol.toUpperCase())
      );
      if (!stable) return new Map();

      // Unique tokens among the displayed pools — only these get priced.
      const displayed = pools.slice(0, DISPLAY_CAP);
      const uniq = new Map<string, SwapToken>();
      for (const p of displayed) {
        uniq.set(p.tokenA.address.toLowerCase(), p.tokenA);
        uniq.set(p.tokenB.address.toLowerCase(), p.tokenB);
      }
      const tokens = [...uniq.values()];

      const priceOf = async (tk: SwapToken): Promise<number | null> => {
        if (tk.address.toLowerCase() === stable.address.toLowerCase()) return 1;
        const one = 10n ** BigInt(tk.decimals);
        return (
          (await valueToStable(
            publicClient,
            routerP,
            factory,
            wnative,
            tk,
            stable,
            one,
            chainId
          )) ??
          (routerS !== routerP
            ? await valueToStable(
                publicClient,
                routerS,
                factory,
                wnative,
                tk,
                stable,
                one,
                chainId
              )
            : null)
        );
      };

      const prices = await mapWithConcurrency(tokens, 8, priceOf);
      const map = new Map<string, number | null>();
      tokens.forEach((tk, i) => map.set(tk.address.toLowerCase(), prices[i]));
      return map;
    },
  });
}

/**
 * Generic token-pricing hook. Prices a caller-supplied list of tokens (1 whole
 * token → USD via valueToStable), in parallel with a concurrency cap, and
 * returns a Map keyed by lowercase address → USD price (null = no on-chain
 * route to a stablecoin). Used by the "My Positions" tab so USD values "pop in"
 * after the positions have already painted — mirroring the All Pools
 * progressive display. Tokens are de-duped by address; an empty list is a no-op.
 */
export function useTokenPrices(chainId: number | undefined, tokens: SwapToken[]) {
  const publicClient = usePublicClient({ chainId });

  const key = useMemo(
    () =>
      [...tokens]
        .map((t) => t.address.toLowerCase())
        .sort()
        .join(","),
    [tokens]
  );

  return useQuery({
    queryKey: ["token-prices", chainId, key],
    enabled: !!publicClient && !!chainId && tokens.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, number | null>> => {
      if (!publicClient || !chainId || tokens.length === 0) return new Map();
      const { primary: factory } = getFactoryAddresses(chainId);
      const { primary: routerP, secondary: routerS } = getRouterAddresses(chainId);
      const wnative = WNATIVE[chainId];
      const stable = getTokenList(chainId).find(
        (t) =>
          !t.isNative &&
          ["USDT", "USDC", "USD", "DAI", "BUSD"].includes(t.symbol.toUpperCase())
      );
      if (!stable) return new Map();

      // De-dupe by address (callers may pass the same token many times).
      const uniq = new Map<string, SwapToken>();
      for (const tk of tokens) uniq.set(tk.address.toLowerCase(), tk);
      const list = [...uniq.values()];

      const priceOf = async (tk: SwapToken): Promise<number | null> => {
        if (tk.address.toLowerCase() === stable.address.toLowerCase()) return 1;
        const one = 10n ** BigInt(tk.decimals);
        return (
          (await valueToStable(
            publicClient,
            routerP,
            factory,
            wnative,
            tk,
            stable,
            one,
            chainId
          )) ??
          (routerS !== routerP
            ? await valueToStable(
                publicClient,
                routerS,
                factory,
                wnative,
                tk,
                stable,
                one,
                chainId
              )
            : null)
        );
      };

      const prices = await mapWithConcurrency(list, 8, priceOf);
      const map = new Map<string, number | null>();
      list.forEach((tk, i) => map.set(tk.address.toLowerCase(), prices[i]));
      return map;
    },
  });
}
