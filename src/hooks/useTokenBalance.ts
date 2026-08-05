"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import type { SwapToken } from "@/config/tokens";
import { ERC20_ABI } from "@/config/abis/erc20";
import type { Address } from "@/lib/swap";

export function useTokenBalance(
  token: SwapToken | undefined,
  account: Address | undefined,
  chainId: number | undefined
) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["balance", chainId, token?.address, account],
    enabled: !!token && !!account && !!publicClient,
    staleTime: 12_000,
    queryFn: async (): Promise<bigint> => {
      if (!token || !account || !publicClient) return 0n;
      if (token.isNative) {
        return publicClient.getBalance({ address: account });
      }
      return publicClient.readContract({
        address: token.address,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      });
    },
  });
}
