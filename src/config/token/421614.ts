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
  {
    address: "0x8aaD0434B130a558e10124d31A62985C9872DE0b",
    symbol: "USDT",
    name: "Tether USDT",
    decimals: 18,
    chainId: arbitrumSepolia.id,
  },
  {
    address: "0xE72780B9AB78AeC81d28e595727a997FE3bf1563",
    symbol: "RX",
    name: "RX",
    decimals: 18,
    chainId: arbitrumSepolia.id,
  },
  {
    address: "0x5F63379cCD62C458e417Ae54b5Ac2A399779f492",
    symbol: "TokenFee",
    name: "TokenFee",
    decimals: 18,
    chainId: arbitrumSepolia.id,
  },
];
