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
