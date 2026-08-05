import type { SwapToken } from "@/config/tokens";

export type Address = `0x${string}`;

/**
 * Build candidate swap paths between two tokens.
 * - Direct pair [in, out]
 * - If neither side is the wrapped-native, also try [in, WNATIVE, out]
 *
 * Native tokens are represented by their wrapped address inside paths, because
 * on-chain pairs are always against WBNB/WETH.
 */
export function buildPaths(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  wnative: Address
): Address[][] {
  const a = tokenIn.address;
  const b = tokenOut.address;
  const paths: Address[][] = [[a, b]];

  const aIsNativeWrap = a.toLowerCase() === wnative.toLowerCase();
  const bIsNativeWrap = b.toLowerCase() === wnative.toLowerCase();

  if (!aIsNativeWrap && !bIsNativeWrap) {
    paths.push([a, wnative, b]);
  }
  return paths;
}

/** Resolve the on-chain address used for pair math (wrapped for native). */
export function pairAddress(token: SwapToken): Address {
  return token.address;
}

/** Compute minimum amount out given a slippage in basis points (e.g. 50 = 0.5%). */
export function computeMinAmountOut(
  amountOut: bigint,
  slippageBps: number
): bigint {
  const remaining = 10000n - BigInt(slippageBps);
  return (amountOut * remaining) / 10000n;
}

/** Compute maximum amount in given a slippage in basis points (e.g. 50 = 0.5%). */
export function computeMaxAmountIn(
  amountIn: bigint,
  slippageBps: number
): bigint {
  const expanded = 10000n + BigInt(slippageBps);
  return (amountIn * expanded) / 10000n;
}

/**
 * Auto slippage (basis points). Derived from the live price impact so the
 * tolerance scales with how much the trade moves the pool:
 *   effectiveBps = priceImpact * 2 + 0.3% buffer, clamped to [0.5%, 5%].
 * When price impact is unavailable (e.g. multi-hop path), fall back to the
 * safe 0.5% floor.
 */
export function computeAutoSlippageBps(priceImpact?: number): number {
  const FLOOR = 50; // 0.5%
  const CEIL = 500; // 5%
  const BUFFER = 30; // 0.3%
  if (priceImpact === undefined || priceImpact < 0) return FLOOR;
  const raw = Math.ceil(priceImpact * 10000 * 2) + BUFFER;
  return Math.max(FLOOR, Math.min(CEIL, raw));
}

/** Effective price: how many `out` units per 1 `in` unit. */
export function effectiveRate(
  amountIn: bigint,
  amountOut: bigint,
  decimalsIn: number,
  decimalsOut: number
): number {
  if (amountIn === 0n) return 0;
  const inNorm = Number(amountIn) / 10 ** decimalsIn;
  const outNorm = Number(amountOut) / 10 ** decimalsOut;
  return outNorm / inNorm;
}
