import { bsc, bscTestnet } from "wagmi/chains";

/**
 * Dual-router architecture.
 *
 * first and falls back to PancakeSwap when own liquidity is insufficient.
 * kept as separate PRIMARY / SECONDARY fields so the fallback can be enabled
 * later just by editing SECONDARY.
 */
// 主路由 Router V2
export const ROUTER_PRIMARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  [bscTestnet.id]: "0xE72780B9AB78AeC81d28e595727a997FE3bf1563",
  // [bscTestnet.id]: "0xb38f49E2292582002Fb79a4F85B4E9cBBd921DFA",
};

// 主路由 Factory V2
export const FACTORY_PRIMARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  [bscTestnet.id]: "0x8aaD0434B130a558e10124d31A62985C9872DE0b",
  // [bscTestnet.id]: "0xA6CDa9aA22A930919fB375Ea7A73d3EB996AB0f7",
};

// 次路由 Router V2
export const ROUTER_SECONDARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xA40d547d3A3B835D6DeA72A95384F076d2c58301",
  [bscTestnet.id]: "0x90e4fE8E7a3AeB4A784f8ff4B8a9C8d495fA3e69",
  // [bscTestnet.id]: "0xb38f49E2292582002Fb79a4F85B4E9cBBd921DFA",
};

// 次路由 Factory V2
export const FACTORY_SECONDARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xCe075f468410061772698f6f22AC0e6512875C56",
  [bscTestnet.id]: "0x5F63379cCD62C458e417Ae54b5Ac2A399779f492",
  // [bscTestnet.id]: "0xA6CDa9aA22A930919fB375Ea7A73d3EB996AB0f7",
};

// Trading fee charged by the pair, in basis points. PancakeSwap V2 charges
// 0.25% (25 bps). Must match the deployed router's pair fee — adjust if your
// contract uses a different rate.
export const SWAP_FEE_BPS = 25;

// Pair contract init code hash (used if we ever compute pair addresses off-chain).
// export const INIT_CODE_HASH: Record<number, `0x${string}`> = {
//   [bsc.id]: "0xabf1a15b25423c3c7d89913e6a871fe5fa766a3d719a701e27b568ff7145bf18",
//   [bscTestnet.id]: "0xabf1a15b25423c3c7d89913e6a871fe5fa766a3d719a701e27b568ff7145bf18",
// };

export function getRouterAddresses(chainId: number) {
  return {
    primary: ROUTER_PRIMARY[chainId],
    secondary: ROUTER_SECONDARY[chainId],
  };
}

export function getFactoryAddresses(chainId: number) {
  return {
    primary: FACTORY_PRIMARY[chainId],
    secondary: FACTORY_SECONDARY[chainId],
  };
}

// Wrapped native (BNB、WBNB) per chain.
export const WNATIVE: Record<number, `0x${string}`> = {
  [bsc.id]: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  [bscTestnet.id]: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};
