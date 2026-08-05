import { bsc } from "wagmi/chains";
import { WNATIVE } from "../contracts";
import type { SwapToken } from "../tokens";

// BSC Mainnet (chainId 56)
export const tokens: SwapToken[] = [
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
