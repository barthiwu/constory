"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

/**
 * True only once mounted on the client. Avoids a hydration mismatch:
 * resolvedTheme is unknown on the server and on the first client render
 * (next-themes resolves it from localStorage/system preference just after
 * mount), so we render nothing until then. Implemented via
 * useSyncExternalStore (server snapshot false, client snapshot true) rather
 * than a `useEffect(() => setMounted(true), [])` mount-detection effect, per
 * the react-hooks/set-state-in-effect rule this repo lints with.
 */
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

/**
 * Small floating theme switch, fixed to the bottom-right corner on every
 * page so it's reachable from anywhere in the app -- not tucked away in
 * Settings. Deliberately a simple two-state light/dark toggle (not a
 * light/system/dark picker): clicking it always flips resolvedTheme.
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={cn(
        "fixed bottom-5 right-5 z-50 flex h-11 w-11 items-center justify-center rounded-full",
        "bg-surface border border-border text-text-secondary shadow-lg transition-colors",
        "hover:text-constory-blue hover:border-constory-blue",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-constory-blue focus-visible:ring-offset-2 focus-visible:ring-offset-app-background",
      )}
    >
      <Moon className={cn("h-5 w-5", isDark && "fill-current")} aria-hidden="true" />
    </button>
  );
}
