import type { SwapToken } from "@/config/tokens";
import { FACTORY_ABI } from "@/config/abis/factory";

export type Address = `0x${string}`;

/**
 * Build candidate swap paths between two tokens.
 *
 * Candidates:
 * 1. Direct pair [in, out]
 * 2. A 2-hop bridge through WNATIVE (covers ERC20 -> WNATIVE -> ERC20)
 * 3. A 2-hop bridge through every OTHER listed token
 *
 * This turns the router into a tiny auto-router: e.g. on a chain where only
 * the `tBNB/Token1` and `Token1/Token2` pools exist, swapping `tBNB -> Token2`
 * has no direct pool — but the bridge through Token1 yields the working path
 * `[WBNB, Token1, Token2]`. The quote hook tries every candidate and keeps the
 * one with the best output, so the user always gets a route when one exists.
 *
 * Native tokens are represented by the wrapped address inside paths, because
 * on-chain pairs are always against WBNB/WETH. We key off `isNative` (the
 * placeholder zero-address must never be sent on-chain) and swap it to
 * `wnative` here.
 */
export function buildPaths(
  tokenIn: SwapToken,
  tokenOut: SwapToken,
  wnative: Address,
  allTokens: SwapToken[] = []
): Address[][] {
  const a = tokenIn.isNative ? wnative : tokenIn.address;
  const b = tokenOut.isNative ? wnative : tokenOut.address;
  const paths: Address[][] = [[a, b]];
  const seen = new Set<string>([paths[0].join("-").toLowerCase()]);

  // Push a 2-hop bridge [a, bridge, b]; skip if the bridge equals an endpoint
  // or duplicates an already-listed path.
  const addBridge = (bridge: Address) => {
    if (
      bridge.toLowerCase() === a.toLowerCase() ||
      bridge.toLowerCase() === b.toLowerCase()
    ) {
      return;
    }
    const candidate: Address[] = [a, bridge, b];
    const key = candidate.join("-").toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    paths.push(candidate);
  };

  // Bridge through WNATIVE (covers the ERC20 -> WNATIVE -> ERC20 case).
  addBridge(wnative);

  // Bridge through every other listed token so indirect routes are discoverable.
  for (const tk of allTokens) {
    addBridge(tk.isNative ? wnative : tk.address);
  }

  return paths;
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
  if (priceImpact === undefined || priceImpact < 0) return FLOOR;
  const raw = Math.ceil(priceImpact * 10000 * 2);
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

const PAIR_RESERVE_ABI = [
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
  {
    type: "function",
    name: "token0",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/**
 * Compound price impact across every hop of a chosen swap path.
 *
 * For each hop we read the pool reserves and apply the single-pool x*y=k
 * formula `amountIn / (reserveIn + amountIn)` to that hop's input amount, then
 * compound the result: total = 1 − Π(1 − pᵢ). This works for both direct
 * (1 hop) and bridged (2+ hops) routes, so the UI always shows a real impact
 * figure instead of falling back to an em-dash.
 *
 * `amounts` is the per-hop input amount array returned by the router's
 * getAmountsOut / getAmountsIn (length === path.length). The price-impact
 * ratio is unitless, so token decimals cancel and we can compare the raw wei
 * values directly (amount << reserve keeps the Number() precision loss
 * negligible).
 */
export async function computePathPriceImpact(
  publicClient: any,
  factory: Address,
  path: Address[],
  amounts: readonly bigint[]
): Promise<number | undefined> {
  if (path.length < 2) return undefined;
  let compounded = 0;
  try {
    for (let i = 0; i < path.length - 1; i++) {
      const pair = await publicClient.readContract({
        address: factory,
        abi: FACTORY_ABI,
        functionName: "getPair",
        args: [path[i], path[i + 1]],
      });
      if (!pair || (pair as Address).toLowerCase() === ZERO_ADDRESS) {
        return undefined;
      }
      const [reserve0, reserve1] = (await publicClient.readContract({
        address: pair as Address,
        abi: PAIR_RESERVE_ABI,
        functionName: "getReserves",
      })) as [bigint, bigint];
      const token0 = (await publicClient.readContract({
        address: pair as Address,
        abi: PAIR_RESERVE_ABI,
        functionName: "token0",
      })) as Address;
      const inIsToken0 = token0.toLowerCase() === path[i].toLowerCase();
      const reserveIn = inIsToken0 ? reserve0 : reserve1;
      const r = Number(reserveIn);
      const a = Number(amounts[i]);
      if (!Number.isFinite(r) || !Number.isFinite(a) || r <= 0) {
        return undefined;
      }
      const p = a / (r + a);
      compounded = 1 - (1 - compounded) * (1 - p);
    }
    return compounded;
  } catch {
    return undefined;
  }
}

