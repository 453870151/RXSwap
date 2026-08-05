"use client";

import { useWriteContract } from "wagmi";
import { ROUTER_ABI } from "@/config/abis/router";
import type { SwapToken } from "@/config/tokens";
import type { Address } from "@/lib/swap";

export interface AddLiquidityArgs {
  tokenA: SwapToken;
  tokenB: SwapToken;
  amountADesired: bigint;
  amountBDesired: bigint;
  amountAMin: bigint;
  amountBMin: bigint;
  to: Address;
  router: Address;
}

export function useAddLiquidity() {
  const { writeContractAsync, isPending, data, reset } = useWriteContract();

  async function addLiquidity(args: AddLiquidityArgs) {
    const { tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, router } =
      args;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200);

    // A is native, B is a token.
    if (tokenA.isNative && !tokenB.isNative) {
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "addLiquidityETH",
        args: [tokenB.address, amountBDesired, amountBMin, amountAMin, to, deadline],
        value: amountADesired,
      });
    }
    // B is native, A is a token.
    if (tokenB.isNative && !tokenA.isNative) {
      return writeContractAsync({
        address: router,
        abi: ROUTER_ABI,
        functionName: "addLiquidityETH",
        args: [tokenA.address, amountADesired, amountAMin, amountBMin, to, deadline],
        value: amountBDesired,
      });
    }
    // Both tokens.
    return writeContractAsync({
      address: router,
      abi: ROUTER_ABI,
      functionName: "addLiquidity",
      args: [
        tokenA.address,
        tokenB.address,
        amountADesired,
        amountBDesired,
        amountAMin,
        amountBMin,
        to,
        deadline,
      ],
    });
  }

  return { addLiquidity, isPending, hash: data, reset };
}
