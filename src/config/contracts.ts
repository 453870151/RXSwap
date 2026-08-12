import { bsc, bscTestnet, arbitrum, arbitrumSepolia } from "wagmi/chains";

/**
 * Dual-router architecture.
 *
 * first and falls back to PancakeSwap when own liquidity is insufficient.
 * kept as separate PRIMARY / SECONDARY fields so the fallback can be enabled
 * later just by editing SECONDARY.
 */
// 主路由 Router V2
export const ROUTER_PRIMARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xd13ac8ee75b2997b073285bc0a7f8c30a3285fcb",
  [bscTestnet.id]: "0xb38f49E2292582002Fb79a4F85B4E9cBBd921DFA",
  [arbitrum.id]: "0xDa6999c72984FF68C5C89AC14f51b4004EA67700",
  [arbitrumSepolia.id]: "0xB000B76Ca8DD8C1DEda12f7E3690c6dD926c2daE",
};

// 主路由 Factory V2
export const FACTORY_PRIMARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xfcf71c1c9c3baf35007eeb8a004df67115190684",
  [bscTestnet.id]: "0xA6CDa9aA22A930919fB375Ea7A73d3EB996AB0f7",
  [arbitrum.id]: "0xcA8005055f0B5Dd136a2D52c94cF3Ae6De53b5e1",
  [arbitrumSepolia.id]: "0x6b46BD52e9a17D6577a217Dc8044e636d60e3469",
};

// 次路由 Router V2
export const ROUTER_SECONDARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  [bscTestnet.id]: "0xb38f49E2292582002Fb79a4F85B4E9cBBd921DFA",
  [arbitrum.id]: "0xDa6999c72984FF68C5C89AC14f51b4004EA67700",
  [arbitrumSepolia.id]: "0xB000B76Ca8DD8C1DEda12f7E3690c6dD926c2daE",
};

// 次路由 Factory V2
export const FACTORY_SECONDARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73",
  [bscTestnet.id]: "0xA6CDa9aA22A930919fB375Ea7A73d3EB996AB0f7",
  [arbitrum.id]: "0xcA8005055f0B5Dd136a2D52c94cF3Ae6De53b5e1",
  [arbitrumSepolia.id]: "0x6b46BD52e9a17D6577a217Dc8044e636d60e3469",
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

// Wrapped native (BNB、WBNB、WETH) per chain.
export const WNATIVE: Record<number, `0x${string}`> = {
  [bsc.id]: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  [bscTestnet.id]: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
  [arbitrum.id]: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  [arbitrumSepolia.id]: "0x980B62Da83eFf3D4576C647993b0c1D7faf17c73",
};
