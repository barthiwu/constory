"use client";

import { useEffect } from "react";

/**
 * Warns the user before they close the tab, refresh, or navigate to a
 * different origin while `when` is true — the browser-level backstop for
 * "unsaved changes" protection (Phase 7 spec section 8). This does not (and
 * cannot, in Next's app router without an experimental API) block in-app
 * client-side navigation; the in-app case is handled per-surface via an
 * explicit "Discard changes? / Keep editing" confirmation on the specific
 * action that would lose the edit (closing a dialog, in particular — see
 * components/layout/discard-changes-dialog.tsx).
 */
export function useUnsavedChangesWarning(when: boolean) {
  useEffect(() => {
    if (!when) return;
    function handler(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);
}
