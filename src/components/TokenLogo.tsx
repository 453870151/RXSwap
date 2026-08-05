import clsx from "clsx";
import { useEffect, useId, useMemo, useState } from "react";
import type { SwapToken } from "@/config/tokens";

/** Deterministic hue from a string so each symbol gets a stable color. */
function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) % 360;
  }
  return h;
}

/**
 * Token icon with a three-tier resolution:
 *   1. token.logoURI (remote / custom)
 *   2. /images/symbol/<symbol>.png (local asset in /public)
 *   3. generated SVG badge (first 1-2 letters on a deterministic gradient)
 *
 * Falls through on load error so a broken URL never shows a blank box.
 */
export function TokenLogo({
  token,
  size = 36,
  className,
}: {
  token: SwapToken;
  size?: number;
  className?: string;
}) {
  const localSrc = `/images/symbol/${token.symbol.toLowerCase()}.png`;

  const candidates = useMemo(() => {
    const list: string[] = [];
    const uri = token.logoURI?.trim();
    if (uri) list.push(uri);
    list.push(localSrc);
    return list;
  }, [token.logoURI, localSrc]);

  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [candidates]);

  const src = idx < candidates.length ? candidates[idx] : null;

  const letter = token.symbol.replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase();
  const hue = hashHue(token.symbol);
  const uid = useId().replace(/:/g, "");
  const gradId = `tok-grad-${uid}`;

  const ring = {
    boxShadow:
      "0 0 0 2px var(--glass-border), 0 4px 12px -4px rgba(0,0,0,0.4)",
  } as const;

  if (src) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={src}
        alt={token.symbol}
        width={size}
        height={size}
        className={clsx("shrink-0 rounded-full object-cover", className)}
        style={{ ...ring, width: size, height: size }}
        onError={() => setIdx((i) => i + 1)}
        loading="lazy"
      />
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      className={clsx("shrink-0 rounded-full", className)}
      style={ring}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 70% 52%)`} />
          <stop offset="100%" stopColor={`hsl(${(hue + 40) % 360} 70% 42%)`} />
        </linearGradient>
      </defs>
      <circle cx="18" cy="18" r="18" fill={`url(#${gradId})`} />
      <text
        x="18"
        y="18"
        dy="0.35em"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="#fff"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        {letter}
      </text>
    </svg>
  );
}
