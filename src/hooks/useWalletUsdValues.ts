"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { getTokenList, type SwapToken } from "@/config/tokens";
import { getRouterAddresses, getFactoryAddresses, WNATIVE } from "@/config/contracts";
import { FACTORY_ABI } from "@/config/abis/factory";
import { ROUTER_ABI } from "@/config/abis/router";
import { ERC20_ABI } from "@/config/abis/erc20";
import { buildPaths, type Address } from "@/lib/swap";
import { formatUnits } from "viem";

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

// Stablecoins we treat as the USD reference, in priority order. The first one
// found in the chain's token list becomes the pricing target.
const STABLE_SYMBOLS = ["USDT", "USDC", "USD", "DAI", "BUSD"];

export type WalletBalanceMap = Record<string, bigint>;
export type WalletUsdMap = Record<string, number | null>;

/**
 * Wallet balances for every listed token, in one parallel batch.
 *
 * Kept separate from the USD valuation query so the balance can render
 * immediately (it's a single fast batch) while the slower on-chain pricing
 * (which routes each balance to a stablecoin) is still in flight.
 */
export function useWalletBalances(
  chainId: number | undefined,
  account: Address | undefined
) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["wallet-balances", chainId, account],
    enabled: !!publicClient && !!account && !!chainId,
    staleTime: 15_000,
    refetchInterval: 15_000,
    queryFn: async (): Promise<WalletBalanceMap> => {
      if (!publicClient || !account || !chainId) return {};
      const tokens = getTokenList(chainId);
      const balances = await Promise.all(
        tokens.map((t) =>
          t.isNative
            ? publicClient.getBalance({ address: account }).catch(() => 0n)
            : publicClient
                .readContract({
                  address: t.address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [account],
                })
                .catch(() => 0n)
        )
      );

      const result: WalletBalanceMap = {};
      tokens.forEach((t, i) => {
        result[t.address.toLowerCase()] = balances[i] as bigint;
      });
      return result;
    },
  });
}

/**
 * USD value of every listed token's balance, derived entirely on-chain (no
 * price API): for each token with a non-zero balance we route its full balance
 * to the chain's stablecoin via the same auto-router used by swap
 * (`buildPaths` + `getAmountsOut`) and read back the stable amount. The
 * stablecoin itself is valued 1:1.
 *
 * Independent of `useWalletBalances` so its slower pricing doesn't block the
 * balance display. Tokens with no on-chain route to a stable return `null`.
 */
export function useWalletUsdValues(
  chainId: number | undefined,
  account: Address | undefined
) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["wallet-usd", chainId, account],
    enabled: !!publicClient && !!account && !!chainId,
    staleTime: 15_000,
    // Prices drift slowly; re-poll while the modal is open so a large move still
    // updates, but it only runs while enabled + focused (no idle cost).
    refetchInterval: 15_000,
    queryFn: async (): Promise<WalletUsdMap> => {
      if (!publicClient || !account || !chainId) return {};
      const tokens = getTokenList(chainId);

      // Balances (recomputed here — a cheap batch) are needed to value holdings.
      const balances = await Promise.all(
        tokens.map((t) =>
          t.isNative
            ? publicClient.getBalance({ address: account }).catch(() => 0n)
            : publicClient
                .readContract({
                  address: t.address,
                  abi: ERC20_ABI,
                  functionName: "balanceOf",
                  args: [account],
                })
                .catch(() => 0n)
        )
      );

      // 2) Stablecoin reference (skip native — we never price against tBNB).
      const stable = tokens.find(
        (t) => !t.isNative && STABLE_SYMBOLS.includes(t.symbol.toUpperCase())
      );
      const wnative = WNATIVE[chainId];
      const { primary: routerP, secondary: routerS } = getRouterAddresses(chainId);
      const { primary: factoryP, secondary: factoryS } = getFactoryAddresses(chainId);

      const result: WalletUsdMap = {};
      for (let i = 0; i < tokens.length; i++) {
        const tk = tokens[i];
        const bal = balances[i] as bigint;
        let usd: number | null = null;

        if (bal > 0n && stable) {
          if (tk.address.toLowerCase() === stable.address.toLowerCase()) {
            // 1:1 — use formatUnits (not BigInt division) so fractional stable
            // units are preserved (e.g. 2.826883 USDT, 6 decimals).
            usd = Number(formatUnits(bal, tk.decimals));
          } else {
            usd =
              (await valueToStable(
                publicClient,
                routerP,
                factoryP,
                wnative,
                tk,
                stable,
                bal,
                chainId
              )) ??
              (routerS !== routerP
                ? await valueToStable(
                    publicClient,
                    routerS,
                    factoryS,
                    wnative,
                    tk,
                    stable,
                    bal,
                    chainId
                  )
                : null);
          }
        }

        result[tk.address.toLowerCase()] = usd;
      }
      return result;
    },
  });
}

/**
 * Route `amountInWei` of `tokenIn` to the stablecoin and return the stable
 * amount (normalized to a plain number) — i.e. the USD value of that balance.
 * Reuses the swap auto-router so indirect routes (e.g. Token2 -> Token1 -> USDT)
 * are discovered. Returns null when no tradeable path exists through this router.
 *
 * Exported so other modules (e.g. `useAllPools` TVL pricing) can price any
 * token by passing `amountInWei = 10^decimals` (one whole token) to read its
 * spot USD price.
 */
export async function valueToStable(
  publicClient: any,
  router: Address,
  factory: Address,
  wnative: Address,
  tokenIn: SwapToken,
  stable: SwapToken,
  amountInWei: bigint,
  chainId: number
): Promise<number | null> {
  const paths = buildPaths(tokenIn, stable, wnative, getTokenList(chainId));
  let bestOut: bigint | null = null;

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
      (p: Address) => p && (p as Address).toLowerCase() !== ZERO
    );
    if (!exists) continue;

    try {
      const amounts = await publicClient.readContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: "getAmountsOut",
        args: [amountInWei, path],
      });
      const out = amounts[amounts.length - 1] as bigint;
      if (out > 0n && (bestOut === null || out > bestOut)) bestOut = out;
    } catch {
      // path not tradeable through this router
    }
  }

  if (bestOut === null) return null;
  // formatUnits (decimal string) → Number keeps fractional USDT/USDC digits,
  // unlike BigInt division which would truncate everything below 1 whole unit.
  return Number(formatUnits(bestOut, stable.decimals));
}
