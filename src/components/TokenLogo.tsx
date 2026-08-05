import clsx from "clsx";
import type { SwapToken } from "@/config/tokens";

/** Generated token badge — no external images needed. */
export function TokenLogo({
  token,
  size = 36,
  className,
}: {
  token: SwapToken;
  size?: number;
  className?: string;
}) {
  const letter = token.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  return (
    <span
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-sm",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(135deg, ${token.color}, ${token.color}aa)`,
        boxShadow: `0 0 0 2px var(--glass-border), 0 4px 12px -4px ${token.color}99`,
      }}
      aria-hidden
    >
      {letter}
    </span>
  );
}
