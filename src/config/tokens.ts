import { bsc, bscTestnet } from "wagmi/chains";
import { WNATIVE } from "./contracts";
import { CHAIN_TOKENS } from "./token";

export interface SwapToken {
  /** ERC20 address, or the wrapped-native address for the native asset. */
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  /** Native asset (BNB / tBNB). Uses wrapped-native address for pair math. */
  isNative?: boolean;
  /** A color used to render a generated token badge (no external images). */
  color: string;
}

const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

export function getTokenList(chainId: number): SwapToken[] {
  return CHAIN_TOKENS[chainId] ?? CHAIN_TOKENS[bsc.id] ?? [];
}

export function getNativeToken(chainId: number): SwapToken {
  const list = getTokenList(chainId);
  const native = list.find((t) => t.isNative);
  if (native) return native;
  // Fallback: synthetic native using wrapped address.
  return {
    address: WNATIVE[chainId],
    symbol: chainId === bscTestnet.id ? "tBNB" : "BNB",
    name: "BNB",
    decimals: 18,
    chainId,
    isNative: true,
    color: "#F0B90B",
  };
}

export function getTokenByAddress(
  chainId: number,
  address: `0x${string}`
): SwapToken | undefined {
  const list = getTokenList(chainId);
  const target = address.toLowerCase();
  return list.find((t) => t.address.toLowerCase() === target);
}

export { ZERO as ZERO_ADDRESS };
