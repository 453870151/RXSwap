import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { ToastProvider } from "@/components/Toaster";

// Cookie name mirrors LOCALE_STORAGE_KEY in src/locales/i18n.ts. We hardcode it
// here on purpose: layout is a SERVER component and must NOT import the i18n
// module (react-i18next's createContext breaks in the RSC environment).
const LOCALE_COOKIE = "rxswap-locale";

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
  // Resolve the persisted language from the cookie. We only READ it here and
  // pass the value down to the client LanguageProvider, which applies it before
  // rendering children — keeping the server HTML in sync with the first client
  // render and preventing hydration text mismatches.
  const raw = cookies().get(LOCALE_COOKIE)?.value;
  const locale = raw === "zh-TW" || raw === "en" ? raw : "en";

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">
        <Providers ssrLocale={locale}>
          <ToastProvider>
            <AppHeader />
            <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 pb-20 pt-24 sm:px-6 md:pb-16 lg:pt-28">
              <main className="flex flex-1 flex-col items-center justify-start">
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
