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

/**
 * Adaptive balance formatter: normal/large amounts show 2 decimals (with
 * thousands separators); very small amounts keep up to 5 fraction digits so a
 * dust balance isn't rounded down to "0.00".
 * Truncation only — never rounds (四舍五入). e.g. 125.127213 -> "125.12",
 * 1250.5 -> "1,250.50", 0.0004578 -> "0.00045".
 */
export function formatBalance(value: bigint, decimals: number): string {
  if (value <= 0n) return "0";
  const full = formatUnits(value, decimals);
  const [intPart, frac = ""] = full.split(".");
  if (Number(intPart) >= 1 || intPart !== "0") {
    // Large/normal amount: truncate (NOT round) to 2 decimals so the displayed
    // balance never exceeds the real balance.
    const two = (frac + "00").slice(0, 2);
    const intFmt = Number(intPart).toLocaleString("en-US");
    return `${intFmt}.${two}`;
  }
  // Dust amount (< 1): keep up to 5 fraction digits, trim trailing zeros.
  const trimmed = frac.slice(0, 5).replace(/0+$/, "");
  return trimmed ? `${intPart}.${trimmed}` : intPart;
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
  if (!isFinite(value)) return "$0.00";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Format slippage bps as a percentage without trailing zeros: 100 -> "1". */
export function formatSlippage(bps: number): string {
  return String(bps / 100);
}

// Price impact color tiers (pure x*y=k slippage, fee excluded):
// <=1% green, 1–3% default, 3–10% amber, >10% pink.
export function priceImpactColor(impact: number): string {
  const pct = impact * 100;
  if (pct <= 1) return "#129E7D";
  if (pct <= 3) return "";
  if (pct <= 10) return "#FFB237";
  return "#ED4B9E";
}

/** Display text: anything below 0.01% is shown as "<0.01%". */
export function formatPriceImpact(impact: number): string {
  if (impact < 0.0001) return "<0.01%";
  return `${(impact * 100).toFixed(2)}%`;
}
