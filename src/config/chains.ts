import { bsc, bscTestnet } from "wagmi/chains";

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
};

export const SUPPORTED_CHAINS: number[] = [bsc.id, bscTestnet.id];

export function getChainMeta(chainId: number | undefined): ChainMeta | undefined {
  if (chainId === undefined) return undefined;
  return CHAIN_META[chainId];
}
