import { Check } from "lucide-react";
import { PLANS, PLAN_ORDER } from "@/lib/billing/plans";

const ROWS: Array<{ label: string; getValue: (planId: (typeof PLAN_ORDER)[number]) => string }> = [
  { label: "Brands / workspaces", getValue: (id) => String(PLANS[id].entitlements.brands ?? "Unlimited") },
  { label: "Strategies", getValue: (id) => (PLANS[id].entitlements.strategies === null ? "Unlimited" : String(PLANS[id].entitlements.strategies)) },
  { label: "Content pillars", getValue: (id) => (PLANS[id].entitlements.pillars === null ? "Unlimited" : String(PLANS[id].entitlements.pillars)) },
  { label: "Content ideas", getValue: (id) => (PLANS[id].entitlements.ideas === null ? "Unlimited" : String(PLANS[id].entitlements.ideas)) },
  { label: "Calendars", getValue: (id) => (PLANS[id].entitlements.calendars === null ? "Unlimited" : String(PLANS[id].entitlements.calendars)) },
  { label: "Manual content creation", getValue: () => "check" },
  { label: "AI credits / month", getValue: (id) => String(PLANS[id].entitlements.aiCreditsPerMonth) },
  { label: "Product intelligence", getValue: (id) => (PLANS[id].entitlements.intelligence === "full" ? "Full" : "Basic") },
];

export function ComparisonTable() {
  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-3 text-left font-medium text-text-secondary">Feature</th>
            {PLAN_ORDER.map((id) => (
              <th key={id} className="py-3 text-center font-semibold text-text-primary">
                {PLANS[id].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-b border-border last:border-0">
              <td className="py-3 text-text-secondary">{row.label}</td>
              {PLAN_ORDER.map((id) => {
                const value = row.getValue(id);
                return (
                  <td key={id} className="py-3 text-center text-text-primary">
                    {value === "check" ? <Check className="mx-auto h-4 w-4 text-constory-blue" aria-hidden="true" /> : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
