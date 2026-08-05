"use client";

import { useWriteContract } from "wagmi";
import { ERC20_ABI } from "@/config/abis/erc20";
import type { Address } from "@/lib/swap";

export function useApprove() {
  const { writeContractAsync, isPending, data, reset } = useWriteContract();

  async function approve(
    tokenAddress: Address,
    spender: Address,
    amount: bigint
  ) {
    return writeContractAsync({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, amount],
    });
  }

  return { approve, isPending, hash: data, reset };
}
