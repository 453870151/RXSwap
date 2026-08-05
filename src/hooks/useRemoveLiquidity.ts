"use client";

import { useWriteContract } from "wagmi";
import { ROUTER_ABI } from "@/config/abis/router";
import type { SwapToken } from "@/config/tokens";
import type { Address } from "@/lib/swap";

export interface RemoveLiquidityArgs {
  tokenA: SwapToken;
  tokenB: SwapToken;
  liquidity: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  to: Address;
  router: Address;
}

export function useRemoveLiquidity() {
  const { writeContractAsync, isPending, data, reset } = useWriteContract();

  async function removeLiquidity(args: RemoveLiquidityArgs) {
    const { tokenA, tokenB, liquidity, amountAMin, amountBMin, to, router } =
      args;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    // A native, B token.
    if (tokenA.isNative && !tokenB.isNative) {
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "removeLiquidityETH",
        args: [tokenB.address, liquidity, amountBMin, amountAMin, to, deadline],
      });
    }
    // B native, A token.
    if (tokenB.isNative && !tokenA.isNative) {
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "removeLiquidityETH",
        args: [tokenA.address, liquidity, amountAMin, amountBMin, to, deadline],
      });
    }
    // Both tokens.
    return writeContractAsync({
      address: router,
      abi: ROUTER_ABI,
      functionName: "removeLiquidity",
      args: [
        tokenA.address,
        tokenB.address,
        liquidity,
        amountAMin,
        amountBMin,
        to,
        deadline,
      ],
    });
  }

  return { removeLiquidity, isPending, hash: data, reset };
}
