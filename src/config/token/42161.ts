import { arbitrum } from "wagmi/chains";
import { WNATIVE } from "../contracts";
import type { SwapToken } from "../tokens";

// Arbitrum One (chainId 42161)
export const tokens: SwapToken[] = [
  // {
  //   address: WNATIVE[arbitrum.id],
  //   symbol: "WETH",
  //   name: "Wrapped Ether",
  //   decimals: 18,
  //   chainId: arbitrum.id,
  //   logoURI:
  //     "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/assets/0x82aF49447D8a07e3bd95BD0d56f35241523fBab1/logo.png",
  // },
  // {
  //   address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  //   symbol: "USDT",
  //   name: "Tether USDT",
  //   decimals: 6,
  //   chainId: arbitrum.id,
  // },
  {
    address: "0x53615f4Fe3d2873CF5be7dCBE3331Ca48946aCF7",
    symbol: "USDT",
    name: "RXTest USDT",
    decimals: 6,
    chainId: arbitrum.id,
  },
  {
    address: "0x705079F9414DCcd2E8bF764436DcaCd804E4d8a2",
    symbol: "RXTest",
    name: "RXTest Token",
    decimals: 18,
    chainId: arbitrum.id,
  },
  {
    address: "0x3161B83D0fC23cE80a5fdB078c6b13e6378f1638",
    symbol: "RXTest002",
    name: "RXTest002 Token",
    decimals: 18,
    chainId: arbitrum.id,
  },
  {
    address: "0x4Ae89EbF705E33cfa3d58A3a4eBD6078B36Ca2E7",
    symbol: "RXTest003",
    name: "RXTest003 Token",
    decimals: 18,
    chainId: arbitrum.id,
  },
];
