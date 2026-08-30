const FAQS = [
  {
    q: "What happens when I run out of AI credits?",
    a: "AI generation becomes unavailable until your next monthly credit reset, or until you upgrade. Every manual feature included in your plan stays fully available — nothing about writing, planning, or organizing content by hand ever depends on AI credits.",
  },
  {
    q: "Do unused AI credits roll over?",
    a: "No. Credits reset at the start of each monthly usage period, and whatever's left over does not carry forward.",
  },
  {
    q: "Does quarterly or annual billing give me all my credits at once?",
    a: "No. AI credits are always allocated monthly, regardless of your billing interval — a Creator plan gets 85 credits every month whether you're billed monthly, quarterly, or annually.",
  },
  {
    q: "Can I change my plan?",
    a: "Yes — you can upgrade or downgrade at any time from Settings → Billing. If a downgrade would put you over a plan limit (like the number of brands you can have active), your existing data is never deleted; you'll be asked to choose which brands stay active.",
  },
  {
    q: "Is there a free plan?",
    a: "Yes. The Free plan is permanently available at $0, with 10 AI credits every month and the full manual workflow.",
  },
];

export function PricingFAQ() {
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-3">
      {FAQS.map((item) => (
        <details key={item.q} className="group rounded-lg border border-border bg-surface p-4 open:pb-4">
          <summary className="cursor-pointer list-none text-sm font-medium text-text-primary marker:content-none">
            <span className="flex items-center justify-between gap-4">
              {item.q}
              <span className="shrink-0 text-text-muted transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </span>
          </summary>
          <p className="mt-2 text-sm text-text-secondary">{item.a}</p>
        </details>
      ))}
    </div>
  );
}
