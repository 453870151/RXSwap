import { arbitrumSepolia } from "wagmi/chains";
import { WNATIVE } from "../contracts";
import type { SwapToken } from "../tokens";

// Arbitrum Sepolia (chainId 421614)
export const tokens: SwapToken[] = [
  {
    address: WNATIVE[arbitrumSepolia.id],
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    chainId: arbitrumSepolia.id,
    logoURI:
      "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x82aF49447D8a07e3bd95BD0d56f35241523fBab1/logo.png",
  },
];
