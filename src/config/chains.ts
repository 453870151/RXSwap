import { bsc, bscTestnet, arbitrum, arbitrumSepolia } from "wagmi/chains";

export interface ChainMeta {
  id: number;
  name: string;
  shortName: string;
  nativeSymbol: string;
  explorer: string;
  testnet: boolean;
}

export const CHAIN_META: Record<number, ChainMeta> = {
  [bsc.id]: {
    id: bsc.id,
    name: "BNB Smart Chain",
    shortName: "BSC",
    nativeSymbol: "BNB",
    explorer: "https://bscscan.com",
    testnet: false,
  },
  [bscTestnet.id]: {
    id: bscTestnet.id,
    name: "BNB Smart Chain Testnet",
    shortName: "BSC Test",
    nativeSymbol: "tBNB",
    explorer: "https://testnet.bscscan.com",
    testnet: true,
  },
  [arbitrum.id]: {
    id: arbitrum.id,
    name: "Arbitrum One",
    shortName: "Arbitrum",
    nativeSymbol: "ETH",
    explorer: "https://arbiscan.io",
    testnet: false,
  },
  [arbitrumSepolia.id]: {
    id: arbitrumSepolia.id,
    name: "Arbitrum Sepolia",
    shortName: "Arbitrum Sepolia",
    nativeSymbol: "ETH",
    explorer: "https://sepolia.arbiscan.io",
    testnet: true,
  },
};

export const SUPPORTED_CHAINS: number[] = [
  bsc.id,
  bscTestnet.id,
  arbitrum.id,
  arbitrumSepolia.id,
];

export function getChainMeta(chainId: number | undefined): ChainMeta | undefined {
  if (chainId === undefined) return undefined;
  return CHAIN_META[chainId];
}
