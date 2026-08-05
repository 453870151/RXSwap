import { bsc, bscTestnet } from "wagmi/chains";
import { WNATIVE } from "./contracts";

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

// --- Mainnet (56) ---
export const BSC_TOKENS: SwapToken[] = [
  {
    address: WNATIVE[bsc.id],
    symbol: "BNB",
    name: "BNB",
    decimals: 18,
    chainId: bsc.id,
    isNative: true,
    color: "#F0B90B",
  },
  {
    address: "0x55d398326f99059fF775485246999027B3197955",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 18,
    chainId: bsc.id,
    color: "#26A17B",
  },
  {
    address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
    symbol: "BUSD",
    name: "Binance USD",
    decimals: 18,
    chainId: bsc.id,
    color: "#F0B90B",
  },
  {
    address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 18,
    chainId: bsc.id,
    color: "#2775CA",
  },
  {
    address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8",
    symbol: "ETH",
    name: "Binance-Peg Ethereum",
    decimals: 18,
    chainId: bsc.id,
    color: "#627EEA",
  },
  {
    address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c",
    symbol: "BTCB",
    name: "Binance BTC",
    decimals: 18,
    chainId: bsc.id,
    color: "#F09242",
  },
];

// --- Testnet (97) ---
export const BSC_TESTNET_TOKENS: SwapToken[] = [
  {
    address: WNATIVE[bscTestnet.id],
    symbol: "tBNB",
    name: "BNB",
    decimals: 18,
    chainId: bscTestnet.id,
    isNative: true,
    color: "#F0B90B",
  },
  {
    address: "0xb73C85c1c8aca26F1b3aC4863B4D658096802A84",
    symbol: "BUY",
    name: "BunnySwap Token",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#FF2E93",
  },
  {
    address: "0xE717433ce2f87244FEb01d25c203ECc261D86158",
    symbol: "BUSD",
    name: "Binance BUSD (Testnet)",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#F0B90B",
  },
  {
    address: "0x44004827f2F72566E12884A38f63f72F2a5143ea",
    symbol: "USDT",
    name: "Binance USDT (Testnet)",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#26A17B",
  },
  {
    address: "0x64544969ed7EBf5f083679233325356EbE738930",
    symbol: "USDC",
    name: "Binance-Peg USD Coin (Testnet)",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#2775CA",
  },
  {
    address: "0x10dC9d371F2778e7B25fDB4b2440C9B200934866",
    symbol: "USD",
    name: "Tether USD (Testnet)",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#50AF95",
  },
  {
    address: "0xB68996993f82ADAdD51a6B7aeC5C354f4B94c285",
    symbol: "Token1",
    name: "Token1 (Testnet)",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#50AF95",
  },
  {
    address: "0x94599F9bc5E46C49b2F73012F9FC4859263769Cf",
    symbol: "Token2",
    name: "Token2 (Testnet)",
    decimals: 18,
    chainId: bscTestnet.id,
    color: "#50AF95",
  },
];

export function getTokenList(chainId: number): SwapToken[] {
  return chainId === bscTestnet.id ? BSC_TESTNET_TOKENS : BSC_TOKENS;
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
