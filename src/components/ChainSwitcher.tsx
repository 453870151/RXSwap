"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAccount, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS, getChainMeta } from "@/config/chains";
import clsx from "clsx";

export function ChainSwitcher() {
  const { chainId } = useAccount();
  const { switchChainAsync, isPending } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const activeId =
    chainId && SUPPORTED_CHAINS.includes(chainId) ? chainId : SUPPORTED_CHAINS[0];
  const activeMeta = getChainMeta(activeId);

  // Portal target is only available on the client.
  useEffect(() => setMounted(true), []);

  // Close on outside click / Escape.
  // The mobile sheet is portalled to body, so we check sheetRef as well.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideRoot = rootRef.current?.contains(target);
      const insideSheet = sheetRef.current?.contains(target);
      if (!insideRoot && !insideSheet) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = async (id: number) => {
    if (id === activeId) {
      setOpen(false);
      return;
    }
    try {
      await switchChainAsync({ chainId: id });
    } catch {
      // user rejected or switch failed — silently close
    }
    setOpen(false);
  };

  const chainOptions = SUPPORTED_CHAINS.map((id) => {
    const meta = getChainMeta(id);
    const isActive = activeId === id;
    return (
      <button
        key={id}
        type="button"
        role="option"
        aria-selected={isActive}
        disabled={isPending}
        onClick={() => handleSelect(id)}
        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left text-[13px] transition-colors md:gap-2.5 md:py-2.5 ${
          isActive
            ? "text-white"
            : "text-[#7A8A9A] hover:bg-white/[0.04] hover:text-white"
        }`}
        style={
          isActive
            ? {
                background:
                  "linear-gradient(90deg, rgba(200,169,81,0.1) 0%, rgba(6,182,212,0.06) 100%)",
                borderLeft: "2px solid #C8A951",
              }
            : {}
        }
      >
        <img
          src={`/images/chains/${id}.png`}
          alt={meta?.name ?? "Chain"}
          className="h-10 w-auto rounded-[50px] object-contain md:h-9"
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold leading-tight">
            {meta?.name}
          </span>
        </span>
        {isActive && (
          <svg
            className="h-3.5 w-3.5 shrink-0"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M2.5 7.5L6 11l5.5-6.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    );
  });

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={clsx(
          "glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-300"
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        <span className="text-[var(--text)]">{activeMeta?.shortName}</span>
        <svg
          className={clsx(
            "h-3 w-3 text-[var(--text-muted)] transition-transform duration-300",
            open && "rotate-180"
          )}
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Desktop dropdown */}
      <div
        role="listbox"
        className={clsx(
          "absolute right-0 z-50 mt-4 hidden w-60 rounded-xl overflow-hidden md:block",
          open
            ? "visible scale-100 opacity-100"
            : "invisible scale-95 opacity-0 pointer-events-none"
        )}
        style={{
          background: "#0D0D1A",
          border: "1px solid rgba(200, 169, 81, 0.2)",
          boxShadow:
            "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset",
        }}
      >
        {chainOptions}
      </div>

      {/* Mobile bottom sheet — portalled to body so it floats above BottomNav. */}
      {mounted &&
        createPortal(
          <div
            ref={sheetRef}
            className="md:hidden"
            aria-hidden={!open}
          >
            <div
              className={clsx(
                "fixed inset-0 z-[60] bg-black/60 transition-opacity",
                open
                  ? "visible opacity-100"
                  : "invisible opacity-0 pointer-events-none"
              )}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              role="listbox"
              className={clsx(
                "fixed inset-x-0 bottom-0 z-[70] overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] transition-all duration-200 ease-out",
                open
                  ? "visible translate-y-0 opacity-100"
                  : "invisible translate-y-full opacity-0 pointer-events-none"
              )}
              style={{
                background: "#0D0D1A",
                border: "1px solid rgba(200, 169, 81, 0.2)",
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset",
              }}
            >
              <div className="flex justify-center pt-2.5 pb-1">
                <div className="h-1 w-10 rounded-full bg-white/20" />
              </div>
              {chainOptions}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
