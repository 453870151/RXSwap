import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/Toaster";

export const metadata: Metadata = {
  title: "RX EXCHANGE",
  description: "A premium BNB Chain swap & liquidity interface.",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  themeColor: "#020914",
  width: "device-width",
  initialScale: 1,
};

// Force dark theme to match the landing-page visual style.
const themeScript = `
(function() {
  try {
    document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <ToastProvider>
            <AppHeader />
            <div className="relative mx-auto flex min-h-screen w-full max-w-2xl flex-col px-4 pb-20 pt-24 sm:px-6 md:pb-16 lg:pt-28">
              <main className="flex flex-1 flex-col items-center justify-start pt-6 sm:pt-8">
                {children}
              </main>
            </div>
            <BottomNav />
          </ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
