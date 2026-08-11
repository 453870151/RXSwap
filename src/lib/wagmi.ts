import { createConfig, http, injected } from "wagmi";
import { bsc, bscTestnet, arbitrum, arbitrumSepolia } from "wagmi/chains";

// BSC mainnet + BSC testnet + Arbitrum One + Arbitrum Sepolia, all switchable.
// Public RPCs (override with env if you run your own node).
const bscRpc = process.env.NEXT_PUBLIC_BSC_RPC ?? "https://bsc-dataseed.bnbchain.org";
const bscTestnetRpc =
  process.env.NEXT_PUBLIC_BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const arbitrumRpc =
  process.env.NEXT_PUBLIC_ARB_RPC ?? "https://arb1.arbitrum.io/rpc";
const arbitrumSepoliaRpc =
  process.env.NEXT_PUBLIC_ARB_SEPOLIA_RPC ??
  "https://sepolia-rollup.arbitrum.io/rpc";

export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet, arbitrum, arbitrumSepolia],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  ssr: true,
  transports: {
    [bsc.id]: http(bscRpc),
    [bscTestnet.id]: http(bscTestnetRpc),
    [arbitrum.id]: http(arbitrumRpc),
    [arbitrumSepolia.id]: http(arbitrumSepoliaRpc),
  },
});
