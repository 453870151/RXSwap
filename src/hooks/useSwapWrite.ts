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
  /**
   * True when either side is a transfer-fee / tax / reflection token. Routes
   * the swap through the router's `SupportingFeeOnTransferTokens` family, which
   * only exists for exact-input swaps. The caller (SwapCard) must force
   * exact-in whenever this is true, so this flag is only ever observed in the
   * exactIn branch below.
   */
  feeOnTransfer?: boolean;
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
      feeOnTransfer = false,
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
    if (feeOnTransfer) {
      // Transfer-fee / tax / reflection tokens must use the Supporting family.
      // It only exists for exact-input swaps (no ForExactTokens variant), which
      // is why the UI forces exact-in whenever either side is a fee token. The
      // router measures the actual received balance after the output token's
      // transfer fee, so `amountOutMinWei` is checked against the real amount.
      if (tokenIn.isNative) {
        return writeContractAsync({
          address: router,
          abi: ROUTER_ABI,
          functionName: "swapExactETHForTokensSupportingFeeOnTransferTokens",
          args: [amountOutMinWei, path, to, deadline],
          value: amountInWei,
        });
      }
      if (tokenOut.isNative) {
        return writeContractAsync({
          address: router,
          abi: ROUTER_ABI,
          functionName: "swapExactTokensForETHSupportingFeeOnTransferTokens",
          args: [amountInWei, amountOutMinWei, path, to, deadline],
        });
      }
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "swapExactTokensForTokensSupportingFeeOnTransferTokens",
        args: [amountInWei, amountOutMinWei, path, to, deadline],
      });
    }

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
