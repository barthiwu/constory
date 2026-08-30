const SEGMENT_COLORS = ["#168BFF", "#0A5FCC", "#7DC4FF", "#B7DEFF", "#0A0A0A", "#667085"];

export function ContentMixBar({ segments }: { segments: Array<{ name: string; percentage: number }> }) {
  if (segments.length === 0) return null;

  return (
    <div className="grid gap-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-secondary">
        {segments.map((s, i) => (
          <div
            key={s.name}
            style={{ width: `${s.percentage}%`, backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            title={`${s.name}: ${s.percentage}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((s, i) => (
          <div key={s.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
              aria-hidden="true"
            />
            {s.name} · {s.percentage}%
          </div>
        ))}
      </div>
    </div>
  );
}
