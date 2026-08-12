import { bsc } from "wagmi/chains";
import { WNATIVE } from "../contracts";
import type { SwapToken } from "../tokens";

// BSC Mainnet (chainId 56)
export const tokens: SwapToken[] = [
  // {
  //   address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  //   symbol: "WBNB",
  //   name: "Wrapped BNB",
  //   decimals: 18,
  //   chainId: bsc.id,
  //   logoURI:
  //     "https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png",
  // },
  // {
  //   address: "0x55d398326f99059fF775485246999027B3197955",
  //   symbol: "USDT",
  //   name: "Tether USD",
  //   decimals: 18,
  //   chainId: bsc.id,
  //   logoURI:
  //     "https://tokens.pancakeswap.finance/images/0x55d398326f99059fF775485246999027B3197955.png",
  // },
  // {
  //   address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
  //   symbol: "BUSD",
  //   name: "Binance USD",
  //   decimals: 18,
  //   chainId: bsc.id,
  //   logoURI:
  //     "https://tokens.pancakeswap.finance/images/0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56.png",
  // },
  {
    address: "0xca8005055f0b5dd136a2d52c94cf3ae6de53b5e1",
    symbol: "USDT",
    name: "RXTest USDT",
    decimals: 18,
    chainId: bsc.id,
  },
  {
    address: "0xda6999c72984ff68c5c89ac14f51b4004ea67700",
    symbol: "RXBSCTest",
    name: "RXBSCTest Token",
    decimals: 18,
    chainId: bsc.id,
  },
  // {
  //   address: "0xcd9654c60a33362ea41adcbc65116f4ab5f16e38",
  //   symbol: "RXBSCTest002",
  //   name: "RXBSCTest002 Token",
  //   decimals: 18,
  //   chainId: bsc.id,
  // },
  // {
  //   address: "0x705079f9414dccd2e8bf764436dcacd804e4d8a2",
  //   symbol: "RXBSCTest003",
  //   name: "RXBSCTest003 Token",
  //   decimals: 18,
  //   chainId: bsc.id,
  // },
];
