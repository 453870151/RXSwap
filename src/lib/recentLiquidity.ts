/**
 * Tracks the most-recent time the user added liquidity to each on-chain pair,
 * per chain. The DEX reads positions from the wallet on-chain only, which has
 * no "created at" info, so we persist a local timestamp at the moment an add
 * succeeds. The list then sorts pairs with a known add-time to the top (newest
 * first); positions added before this feature existed fall back to their
 * natural order below.
 */

const KEY = "rxswap:recent-liquidity";

type ChainMap = Record<string, number>; // pairAddress(lower) -> epoch ms
type Store = Record<string, ChainMap>; // chainId -> ChainMap

function read(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode — non-fatal */
  }
}

/** Record (or refresh) the timestamp for a pair the user just added liquidity to. */
export function recordLiquidityAdded(chainId: number, pair: string) {
  const store = read();
  const cid = String(chainId);
  if (!store[cid]) store[cid] = {};
  store[cid][pair.toLowerCase()] = Date.now();
  write(store);
}

/** Epoch ms when the user last added this pair, or 0 if never recorded. */
export function getLiquidityAddedAt(chainId: number, pair: string): number {
  const store = read();
  return store[String(chainId)]?.[pair.toLowerCase()] ?? 0;
}
