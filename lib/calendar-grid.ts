/** Returns the array of ISO date strings (YYYY-MM-DD) to render in a month grid, padded to full weeks (Sun–Sat). */
export function getMonthGridDates(year: number, month: number): string[] {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);

  const dates: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    dates.push(toISODate(d));
  }
  // Trim trailing rows that are entirely outside the target month, keeping full weeks only.
  const lastOfMonth = new Date(year, month + 1, 0);
  while (dates.length > 35) {
    const last = new Date(`${dates[dates.length - 1]}T00:00:00`);
    if (last > lastOfMonth && last.getDay() === 6) {
      dates.splice(dates.length - 7, 7);
    } else {
      break;
    }
  }
  return dates;
}

export function toISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getWeekDates(anchorISO: string): string[] {
  const anchor = new Date(`${anchorISO}T00:00:00`);
  const start = new Date(anchor);
  start.setDate(anchor.getDate() - anchor.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toISODate(d);
  });
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
