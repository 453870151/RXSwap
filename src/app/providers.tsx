"use client";

import { type ReactNode, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi";
import { LanguageProvider } from "@/components/LanguageProvider";

export function Providers({
  children,
  ssrLocale,
}: {
  children: ReactNode;
  ssrLocale: string;
}) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider ssrLocale={ssrLocale}>{children}</LanguageProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
