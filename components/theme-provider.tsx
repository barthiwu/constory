"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Thin wrapper around next-themes so app/layout.tsx (a Server Component)
 * doesn't need to import a client-only library directly. Uses the
 * `data-theme="light" | "dark"` attribute on <html>, matched by the
 * `[data-theme="dark"]` override block in app/globals.css.
 */
export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  );
}
