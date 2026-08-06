import { bscTestnet } from "wagmi/chains";
import { WNATIVE } from "../contracts";
import type { SwapToken } from "../tokens";

// BSC Testnet (chainId 97)
export const tokens: SwapToken[] = [
  {
    address: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
    symbol: "WBNB",
    name: "Wrapped BNB",
    decimals: 18,
    chainId: bscTestnet.id,
    logoURI:
      "https://tokens.pancakeswap.finance/images/0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd.png",
  },
  {
    address: "0xE717433ce2f87244FEb01d25c203ECc261D86158",
    symbol: "BUSD",
    name: "Tether BUSD",
    decimals: 18,
    chainId: bscTestnet.id,
    logoURI:
      "https://tokens.pancakeswap.finance/images/0xE717433ce2f87244FEb01d25c203ECc261D86158.png",
  },
  {
    address: "0x44004827f2F72566E12884A38f63f72F2a5143ea",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 18,
    chainId: bscTestnet.id,
    logoURI:
      "https://tokens.pancakeswap.finance/images/0x44004827f2F72566E12884A38f63f72F2a5143ea.png",
  },
  {
    address: "0x10dC9d371F2778e7B25fDB4b2440C9B200934866",
    symbol: "USD",
    name: "Tether USD",
    decimals: 18,
    chainId: bscTestnet.id,
    logoURI:
      "https://tokens.pancakeswap.finance/images/0x10dC9d371F2778e7B25fDB4b2440C9B200934866.png",
  },
  {
    address: "0xB68996993f82ADAdD51a6B7aeC5C354f4B94c285",
    symbol: "Token1",
    name: "Tether Token1",
    decimals: 18,
    chainId: bscTestnet.id,
  },
  {
    address: "0x94599F9bc5E46C49b2F73012F9FC4859263769Cf",
    symbol: "Token2",
    name: "Tether Token2",
    decimals: 18,
    chainId: bscTestnet.id,
  },
];
