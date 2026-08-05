"use client";

import { useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { SwapToken } from "@/config/tokens";
import { ERC20_ABI } from "@/config/abis/erc20";
import { maxUint256 } from "viem";
import type { Address } from "@/lib/swap";

/** ERC20 allowance; native assets return MaxUint256 (no approval needed). */
export function useTokenAllowance(
  token: SwapToken | undefined,
  owner: Address | undefined,
  spender: Address | undefined,
  chainId: number | undefined
) {
  const publicClient = usePublicClient({ chainId });

  const erc20 = useReadContract({
    address: token?.address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: owner && spender ? [owner, spender] : undefined,
    chainId,
    query: { enabled: !!token && !token.isNative && !!owner && !!spender },
  });

  // Native token: nothing to approve.
  const nativeQuery = useQuery({
    queryKey: ["native-allowance", token?.address],
    enabled: !!token?.isNative,
    queryFn: () => maxUint256,
  });

  if (token?.isNative) {
    return { allowance: maxUint256, isLoading: false, refetch: nativeQuery.refetch };
  }
  return {
    allowance: (erc20.data as bigint) ?? 0n,
    isLoading: erc20.isLoading,
    refetch: erc20.refetch,
  };
}
