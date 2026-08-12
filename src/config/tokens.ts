import { bsc, bscTestnet, arbitrum, arbitrumSepolia } from "wagmi/chains";
import { WNATIVE } from "./contracts";
import { CHAIN_TOKENS } from "./token";

export interface SwapToken {
  /** ERC20 address, or the ZERO placeholder for the native asset. */
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  /** Native asset (BNB / tBNB). Represented by the zero-address placeholder. */
  isNative?: boolean;
  /** Remote logo URL. When empty, falls back to a local image then a generated SVG badge. */
  logoURI?: string;
  /**
   * Transfer-fee / tax / reflection token. When true, the swap must route
   * through the router's `SupportingFeeOnTransferTokens` family (exact-input
   * only) and the quote should discount the output by `transferFeeBps` so the
   * on-chain `amountOutMin` reflects the amount that actually arrives after the
   * token's transfer fee is deducted. Without this, a tax output token can
   * revert the tx (real received < amountOutMin) or show an optimistic quote.
   */
  isFeeOnTransfer?: boolean;
  /**
   * Known transfer fee in basis points (e.g. 100 = 1%). Feeds the quote
   * discount for `amountOutMin` / displayed received. Omit (or 0) if the fee is
   * unknown — the swap still executes via the Supporting family, but the
   * "minimum received" may be optimistic and a high unknown fee could still
   * revert the tx.
   */
  transferFeeBps?: number;
}

/** Zero-address placeholder standing in for the chain's native asset. */
const ZERO = "0x0000000000000000000000000000000000000000" as `0x${string}`;

// Per-chain native-asset metadata. The native coin is synthesized (zero-address
// placeholder + `isNative`) rather than stored in the per-chain files, so its
// display data (symbol / name / logo) lives here, keyed by chainId. Add a new
// chain by appending one entry — no other code needs to change.
const NATIVE_META: Record<
  number,
  { symbol: string; name: string; logoURI: string }
> = {
  [bsc.id]: {
    symbol: "BNB",
    name: "BNB",
    logoURI:
      "https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png",
  },
  [bscTestnet.id]: {
    symbol: "tBNB",
    name: "BNB Testnet",
    logoURI:
      "https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png",
  },
  [arbitrum.id]: {
    symbol: "ETH",
    name: "Ethereum",
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x82aF49447D8a07e3bd95BD0d56f35241523fBab1/logo.png",
  },
  [arbitrumSepolia.id]: {
    symbol: "ETH",
    name: "Ethereum",
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x82aF49447D8a07e3bd95BD0d56f35241523fBab1/logo.png",
  },
};

// Fallback used for any chain not present in NATIVE_META.
const DEFAULT_NATIVE = NATIVE_META[bsc.id];

export function getNativeToken(chainId: number): SwapToken {
  // The native asset is synthesized here with the zero-address placeholder and
  // the `isNative` flag — it is NOT stored in the per-chain files. Routing,
  // balances and approval logic key off `isNative`, never the placeholder.
  // Display metadata is resolved per-chain via NATIVE_META.
  const meta = NATIVE_META[chainId] ?? DEFAULT_NATIVE;
  return {
    address: ZERO,
    symbol: meta.symbol,
    name: meta.name,
    decimals: 18,
    chainId,
    isNative: true,
    logoURI: meta.logoURI,
  };
}

// Raw per-chain token lists (do NOT include a synthetic native entry).
function rawTokenList(chainId: number): SwapToken[] {
  return CHAIN_TOKENS[chainId] ?? CHAIN_TOKENS[bsc.id] ?? [];
}

/**
 * Token list with the native asset pinned to the front (per user request:
 * "show the chain's main coin first" in the select modal). The native entry is
 * prepended, not stored in the per-chain files, so each chain self-documents
 * its native asset without duplicating it.
 */
export function getTokenList(chainId: number): SwapToken[] {
  return [getNativeToken(chainId), ...rawTokenList(chainId)];
}

export function getTokenByAddress(
  chainId: number,
  address: `0x${string}`
): SwapToken | undefined {
  const target = address.toLowerCase();
  return getTokenList(chainId).find(
    (t) => t.address.toLowerCase() === target
  );
}

/**
 * Default swap pair per chain, keyed by token address. The native asset uses
 * ZERO_ADDRESS. Adding a new chain only requires a new entry here plus the
 * per-chain file under config/token/.
 */
export const DEFAULT_TOKENS: Record<
  number,
  { tokenIn: `0x${string}`; tokenOut: `0x${string}` }
> = {
  [bsc.id]: {
    tokenIn: ZERO, // BNB
    tokenOut: "0x55d398326f99059fF775485246999027B3197955", // USDT
  },
  [bscTestnet.id]: {
    tokenIn: ZERO, // tBNB
    tokenOut: "0x44004827f2F72566E12884A38f63f72F2a5143ea", // USDT (testnet)
  },
  [arbitrum.id]: {
    tokenIn: ZERO, // ETH
    // tokenOut: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
    tokenOut: "0x53615f4Fe3d2873CF5be7dCBE3331Ca48946aCF7", // Test USDT
  },
  [arbitrumSepolia.id]: {
    tokenIn: ZERO, // ETH
    tokenOut: "0x8aaD0434B130a558e10124d31A62985C9872DE0b", // USDT (testnet)
  },
};

export function getDefaultTokenIn(chainId: number): SwapToken {
  const def = DEFAULT_TOKENS[chainId];
  const addr = def?.tokenIn ?? ZERO;
  return getTokenByAddress(chainId, addr) ?? getNativeToken(chainId);
}

export function getDefaultTokenOut(chainId: number): SwapToken {
  const def = DEFAULT_TOKENS[chainId];
  const candidate = def?.tokenOut
    ? getTokenByAddress(chainId, def.tokenOut)
    : undefined;
  return (
    candidate ??
    rawTokenList(chainId).find((t) => !t.isNative) ??
    getNativeToken(chainId)
  );
}

export { ZERO as ZERO_ADDRESS };
