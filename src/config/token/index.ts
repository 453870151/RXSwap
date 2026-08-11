import { bsc, bscTestnet, arbitrum, arbitrumSepolia } from "wagmi/chains";
import type { SwapToken } from "../tokens";
import { tokens as bscTokens } from "./56";
import { tokens as bscTestnetTokens } from "./97";
import { tokens as arbitrumTokens } from "./42161";
import { tokens as arbitrumSepoliaTokens } from "./421614";

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
  [arbitrum.id]: arbitrumTokens,
  [arbitrumSepolia.id]: arbitrumSepoliaTokens,
};
