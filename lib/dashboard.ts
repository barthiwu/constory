export interface DashboardState {
  brandComplete: boolean;
  hasStrategy: boolean;
  hasCalendar: boolean;
  activeCalendarId: string | null;
}

export interface PrimaryCta {
  label: string;
  href: string;
}

/**
 * The dashboard's primary call-to-action depends on how far along the
 * workspace is — brand setup, then strategy, then a calendar. This never
 * depends on OpenAI/AI availability: every state has a manual path forward.
 */
export function getPrimaryCta(state: DashboardState): PrimaryCta {
  if (!state.brandComplete) {
    return { label: "Complete Brand Setup", href: "/app/onboarding" };
  }
  if (!state.hasStrategy) {
    return { label: "Create Your Strategy", href: "/app/strategy" };
  }
  if (!state.hasCalendar) {
    return { label: "Create Content Calendar", href: "/app/calendars/new" };
  }
  return { label: "Open Calendar", href: `/app/calendars/${state.activeCalendarId}` };
}
