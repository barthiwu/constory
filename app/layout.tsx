import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SupportWidget } from "@/components/support/support-widget";
import "./globals.css";

// Self-hosted (via next/font/local) rather than next/font/google: it avoids a
// build-time fetch to fonts.googleapis.com entirely, which is both more
// robust in network-restricted build environments and a common production
// practice for privacy/performance. Variable font file sourced from
// @fontsource-variable/inter (Latin subset, weights 100–900).
const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Constory — Plan with purpose. Tell your story.",
  description:
    "Constory is an intelligent workspace for planning content with purpose: turn brand information into strategy, ideas, and an organized content calendar.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request CSP nonce set by proxy.ts. Reading request headers makes every page render dynamically, which is
  // inherent to nonce-based CSP (a static page has no request to carry a nonce).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-app-background text-text-primary">
        <ThemeProvider nonce={nonce}>
          <ToastProvider>{children}</ToastProvider>
          <ThemeToggle />
          <SupportWidget />
        </ThemeProvider>
      </body>
    </html>
  );
}
