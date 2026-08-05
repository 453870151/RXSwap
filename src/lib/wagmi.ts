import { createConfig, http, injected } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";

// BSC mainnet + BSC testnet, both switchable.
// Public RPCs (override with env if you run your own node).
const bscRpc = process.env.NEXT_PUBLIC_BSC_RPC ?? "https://bsc-dataseed.bnbchain.org";
const bscTestnetRpc =
  process.env.NEXT_PUBLIC_BSC_TESTNET_RPC ??
  "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
  ssr: true,
  transports: {
    [bsc.id]: http(bscRpc),
    [bscTestnet.id]: http(bscTestnetRpc),
  },
});
