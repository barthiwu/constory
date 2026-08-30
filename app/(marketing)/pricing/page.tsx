import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PricingSection } from "@/components/pricing/pricing-section";
import { ComparisonTable } from "@/components/pricing/comparison-table";
import { PricingFAQ } from "@/components/pricing/pricing-faq";
import type { PlanId } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Pricing — Constory",
  description: "Simple, transparent pricing for Constory's content strategy, planning, and AI-assisted creation workflow.",
};

// Public route (spec §13) — no auth required. If the visitor happens to be
// signed in already, CTAs route straight to the billing page where the plan
// change actually happens instead of back through signup.
export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  function ctaHrefForPlan(planId: PlanId): string {
    if (user) return `/app/settings/billing?plan=${planId}`;
    return `/signup?plan=${planId}`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-app-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-constory-black">
            Constory
          </Link>
          <nav className="flex items-center gap-2">
            {user ? (
              <Button asChild size="sm">
                <Link href="/app/dashboard">Go to dashboard</Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/login">Log in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/signup">Get Started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
            Plan smarter. <span className="text-constory-blue">Create better content.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-text-secondary">
            Constory helps you move from content strategy to ideas, calendars, and finished content — with AI assistance
            exactly when you need it.
          </p>
        </section>

        <section className="px-4 pb-20 sm:px-6">
          <PricingSection ctaHrefForPlan={ctaHrefForPlan} />
        </section>

        <section className="border-t border-border bg-surface px-4 py-16 sm:px-6">
          <h2 className="mb-10 text-center text-2xl font-semibold text-text-primary">Compare plans</h2>
          <ComparisonTable />
        </section>

        <section className="px-4 py-16 sm:px-6">
          <h2 className="mb-8 text-center text-2xl font-semibold text-text-primary">Frequently asked questions</h2>
          <PricingFAQ />
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-text-secondary sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Constory. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/" className="hover:text-text-primary">
              Home
            </Link>
            <Link href="/login" className="hover:text-text-primary">
              Log in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
