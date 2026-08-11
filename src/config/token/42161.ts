import { arbitrum } from "wagmi/chains";
import { WNATIVE } from "../contracts";
import type { SwapToken } from "../tokens";

// Arbitrum One (chainId 42161)
export const tokens: SwapToken[] = [
  {
    address: WNATIVE[arbitrum.id],
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    chainId: arbitrum.id,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x82aF49447D8a07e3bd95BD0d56f35241523fBab1/logo.png",
  },
];
