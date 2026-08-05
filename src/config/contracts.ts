import { bsc, bscTestnet } from "wagmi/chains";

/**
 * Dual-router architecture.
 *
 * The reference project (bunnySwap / AppleSwap) routes through its OWN factory
 * first and falls back to PancakeSwap when own liquidity is insufficient.
 * Right now both addresses are identical ("双 Router 先用同一个"), but they are
 * kept as separate PRIMARY / SECONDARY fields so the fallback can be enabled
 * later just by editing SECONDARY.
 */
export const ROUTER_PRIMARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xA40d547d3A3B835D6DeA72A95384F076d2c58301",
  [bscTestnet.id]: "0xE22EaFbe4F57973Aad2de67071A751214bFB4461",
};

export const ROUTER_SECONDARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xA40d547d3A3B835D6DeA72A95384F076d2c58301",
  [bscTestnet.id]: "0xE22EaFbe4F57973Aad2de67071A751214bFB4461",
};

// Swap factories (primary = bunnySwap / own, secondary = Pancake fallback).
export const FACTORY_PRIMARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xCe075f468410061772698f6f22AC0e6512875C56",
  [bscTestnet.id]: "0x2096C39c76526FE9468043251043dee5964Ee134",
};

export const FACTORY_SECONDARY: Record<number, `0x${string}`> = {
  [bsc.id]: "0xCe075f468410061772698f6f22AC0e6512875C56",
  [bscTestnet.id]: "0x2096C39c76526FE9468043251043dee5964Ee134",
};

// Wrapped native (WBNB) per chain.
export const WNATIVE: Record<number, `0x${string}`> = {
  [bsc.id]: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
  [bscTestnet.id]: "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd",
};

// Pair contract init code hash (used if we ever compute pair addresses off-chain).
export const INIT_CODE_HASH: Record<number, `0x${string}`> = {
  [bsc.id]: "0xabf1a15b25423c3c7d89913e6a871fe5fa766a3d719a701e27b568ff7145bf18",
  [bscTestnet.id]: "0xabf1a15b25423c3c7d89913e6a871fe5fa766a3d719a701e27b568ff7145bf18",
};

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
