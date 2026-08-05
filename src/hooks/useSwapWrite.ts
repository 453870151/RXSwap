"use client";

import { useWriteContract } from "wagmi";
import { ROUTER_ABI } from "@/config/abis/router";
import type { SwapToken } from "@/config/tokens";
import type { Address } from "@/lib/swap";

export interface SwapWriteArgs {
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  amountInWei: bigint;
  amountOutMinWei: bigint;
  path: Address[];
  router: Address;
  to: Address;
}

export function useSwapWrite() {
  const { writeContractAsync, isPending, data, reset } = useWriteContract();

  async function swap(args: SwapWriteArgs) {
    const { tokenIn, tokenOut, amountInWei, amountOutMinWei, path, router, to } =
      args;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    if (tokenIn.isNative) {
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "swapExactETHForTokens",
        args: [amountOutMinWei, path, to, deadline],
        value: amountInWei,
      });
    }
    if (tokenOut.isNative) {
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForETH",
        args: [amountInWei, amountOutMinWei, path, to, deadline],
      });
    }
    return writeContractAsync({
      address: router,
      abi: ROUTER_ABI,
      functionName: "swapExactTokensForTokens",
      args: [amountInWei, amountOutMinWei, path, to, deadline],
    });
  }

  return { swap, isPending, hash: data, reset };
}
