import { bsc, bscTestnet } from "wagmi/chains";
import type { SwapToken } from "../tokens";
import { tokens as bscTokens } from "./56";
import { tokens as bscTestnetTokens } from "./97";

/**
 * Chain registry: chainId -> token list.
 *
 * To add a new chain:
 *   1. Create `./<chainId>.ts` exporting `tokens: SwapToken[]` (see 56.ts / 97.ts).
 *   2. Register it here with its chainId key.
 */
export const CHAIN_TOKENS: Record<number, SwapToken[]> = {
  [bsc.id]: bscTokens,
  [bscTestnet.id]: bscTestnetTokens,
};
