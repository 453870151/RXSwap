"use client";

import { useWriteContract } from "wagmi";
import { ROUTER_ABI } from "@/config/abis/router";
import type { SwapToken } from "@/config/tokens";
import type { Address } from "@/lib/swap";

export interface SwapWriteArgs {
  tokenIn: SwapToken;
  tokenOut: SwapToken;
  /**
   * exactIn:  amountInWei = exact tokens sold, amountOutMinWei = min received.
   * exactOut: amountInWei  = max tokens to pay (amountInMax),
   *           amountOutMinWei = exact tokens to receive (amountOut).
   */
  amountInWei: bigint;
  amountOutMinWei: bigint;
  path: Address[];
  router: Address;
  to: Address;
  mode?: "exactIn" | "exactOut";
}

export function useSwapWrite() {
  const { writeContractAsync, isPending, data, reset } = useWriteContract();

  async function swap(args: SwapWriteArgs) {
    const {
      tokenIn,
      tokenOut,
      amountInWei,
      amountOutMinWei,
      path,
      router,
      to,
      mode = "exactIn",
    } = args;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    if (mode === "exactOut") {
      // Exact-out: receive `amountOutMinWei` for certain, pay up to `amountInWei`.
      if (tokenIn.isNative) {
        return writeContractAsync({
          address: router,
          abi: ROUTER_ABI,
          functionName: "swapETHForExactTokens",
          args: [amountOutMinWei, path, to, deadline],
          value: amountInWei,
        });
      }
      if (tokenOut.isNative) {
        return writeContractAsync({
          address: router,
          abi: ROUTER_ABI,
          functionName: "swapTokensForExactETH",
          args: [amountOutMinWei, amountInWei, path, to, deadline],
        });
      }
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "swapTokensForExactTokens",
        args: [amountOutMinWei, amountInWei, path, to, deadline],
      });
    }

    // Exact-in (default): sell `amountInWei`, receive at least `amountOutMinWei`.
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
