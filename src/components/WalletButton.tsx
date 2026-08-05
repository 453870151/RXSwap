"use client";

import { useState, useRef, useEffect } from "react";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { SUPPORTED_CHAINS } from "@/config/chains";
import { shortenAddress } from "@/lib/format";
import clsx from "clsx";
import { useTranslation } from "./LanguageProvider";
import { useToast } from "./Toaster";

export function WalletButton() {
  const { t } = useTranslation();
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const wrongNetwork = isConnected && chainId !== undefined && !SUPPORTED_CHAINS.includes(chainId);

  if (wrongNetwork) {
    return (
      <button
        onClick={() => switchChainAsync({ chainId: SUPPORTED_CHAINS[0] })}
        className="btn-gradient px-4 py-2 text-sm"
      >
        {t("common.switchNetwork")}
      </button>
    );
  }

  if (!isConnected) {
    return (
      <button
        onClick={() => connect({ connector: connectors[0] })}
        className="btn-gradient px-4 py-2 text-sm"
      >
        <span className="tracking-wide">
          {connecting ? t("common.connecting") : t("common.connectWallet")}
        </span>
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm rounded-lg border transition-all whitespace-nowrap font-semibold h-[38px] sm:h-[42px]"
        style={{ borderColor: 'rgba(200,169,81,0.3)', color: '#C8A951' }}
      >
        <div className="w-2 h-2 rounded-full bg-amber-300 flex-shrink-0" />
        <span className="font-mono">{shortenAddress(address, 4)}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-3 rounded-2xl overflow-hidden fade-in w-[180px] max-w-[calc(100vw-2rem)] z-[60]"
          style={{
            background: '#0D0D1A',
            border: '1px solid rgba(200,169,81,0.2)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}
        >
          <div className="px-4 pt-4 pb-1">
            <div className="w-5 h-[2px] rounded-full" style={{ background: '#C8A951' }} />
          </div>

          <div className="px-4 pb-1">
            <p className="text-[10px] tracking-[0.1em] uppercase mb-1.5" style={{ color: '#7A8A9A' }}>
              {t('common.connectedWallet')}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono text-white">
                {shortenAddress(address, 4)}
              </span>
              <button
                onClick={() => {
                  if (!address) return;
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(address);
                  } else {
                    const ta = document.createElement('textarea');
                    ta.value = address;
                    ta.style.position = 'fixed';
                    ta.style.opacity = '0';
                    document.body.appendChild(ta);
                    ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                  toast({ type: 'success', message: t('common.copied'), position: 'top' });
                }}
                className="flex-shrink-0 p-1 rounded transition-colors hover:bg-white/10"
                style={{ color: '#7A8A9A' }}
                title={t('common.copyAddress')}
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
              </button>
            </div>
          </div>

          <div className="mx-4 my-2 border-t" style={{ borderColor: 'rgba(200,169,81,0.08)' }} />

          <button
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="w-full px-4 py-2.5 text-left text-[13px] transition-colors flex items-center gap-3 hover:bg-white/[0.03]"
            style={{ color: '#EF4444' }}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t("common.disconnect")}
          </button>
        </div>
      )}
    </div>
  );
}
