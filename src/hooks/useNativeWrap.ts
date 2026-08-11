"use client";

import { useWriteContract, useReadContract } from "wagmi";
import { maxUint256 } from "viem";
import type { Address } from "@/lib/swap";

// Minimal WNATIVE (WBNB/WETH…) ABI: deposit (wrap), withdraw (unwrap), and the
// read/approve surface needed for the unwrap path (WBNB must be approved to the
// WNATIVE contract before `withdraw` can move it).
export const WNATIVE_ABI = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "payable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "guy", type: "address" },
      { name: "wad", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function useNativeWrap() {
  const { writeContractAsync, isPending } = useWriteContract();

  // Wrap native coin → WNATIVE. `value` is the native amount sent with the tx.
  async function deposit(wnative: Address, value: bigint) {
    return writeContractAsync({
      address: wnative,
      abi: WNATIVE_ABI,
      functionName: "deposit",
      args: [],
      value,
    });
  }

  // Unwrap WNATIVE → native coin. `amount` is the WNATIVE to burn.
  async function withdraw(wnative: Address, amount: bigint) {
    return writeContractAsync({
      address: wnative,
      abi: WNATIVE_ABI,
      functionName: "withdraw",
      args: [amount],
    });
  }

  async function approveWnative(wbnb: Address, wnative: Address) {
    return writeContractAsync({
      address: wbnb,
      abi: WNATIVE_ABI,
      functionName: "approve",
      args: [wnative, maxUint256],
    });
  }

  return { deposit, withdraw, approveWnative, isPending };
}

// Read the WBNB allowance granted to the WNATIVE contract (used to decide
// whether the unwrap path still needs an approve step).
export function useWnativeAllowance(
  wbnb: Address | undefined,
  wnative: Address | undefined,
  owner: Address | undefined
) {
  return useReadContract({
    address: wbnb,
    abi: WNATIVE_ABI,
    functionName: "allowance",
    args: owner && wnative ? [owner, wnative] : undefined,
    query: { enabled: !!wbnb && !!wnative && !!owner },
  });
}
