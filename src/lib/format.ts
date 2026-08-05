import { formatUnits } from "viem";

/** Format a raw bigint amount into a trimmed, human-readable string. */
export function formatAmount(
  value: bigint,
  decimals: number,
  maxFractionDigits = 6
): string {
  if (value === 0n) return "0";
  const full = formatUnits(value, decimals);
  const [intPart, fracPart = ""] = full.split(".");
  const trimmedFrac = fracPart.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmedFrac ? `${intPart}.${trimmedFrac}` : intPart;
}

/** Format a number-like string/number with thousands separators. */
export function formatNumber(n: number, maxDigits = 4): string {
  if (!isFinite(n)) return "0";
  if (n !== 0 && Math.abs(n) < 0.0001) return "<0.0001";
  return n.toLocaleString("en-US", {
    maximumFractionDigits: maxDigits,
  });
}

export function shortenAddress(address?: string, chars = 4): string {
  if (!address) return "";
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatUsd(value: number): string {
  return `$${formatNumber(value, 2)}`;
}
