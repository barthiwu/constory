import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass, Lightbulb, CalendarDays, PenLine, Target, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Constory — Plan with purpose. Tell your story.",
};

const FEATURES = [
  { icon: Target, title: "Understand your brand", description: "Constory learns your business, audience, and goals before it writes a single word of content." },
  { icon: Compass, title: "AI content strategy", description: "Get a clear strategy and content pillars grounded in your actual business — not generic advice." },
  { icon: Lightbulb, title: "Never run out of ideas", description: "Generate and organize content ideas that map straight back to your strategy." },
  { icon: CalendarDays, title: "A real content calendar", description: "Month, week, and list views — with AI-generated, fully-detailed posts scheduled for you." },
  { icon: PenLine, title: "Every post, fully written", description: "Briefs, hooks, captions, CTAs, hashtags, and creative direction for every piece of content." },
  { icon: Sparkles, title: "Granular regeneration", description: "Don't like a caption? Regenerate just that — never the whole post." },
];

const WORKFLOW = ["Understand", "Strategize", "Ideate", "Plan", "Create", "Tell better stories"];

export default function MarketingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-app-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-lg font-semibold tracking-tight text-constory-black">Constory</span>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/pricing">Pricing</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
            Plan with purpose. <span className="text-constory-blue">Tell your story.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-text-secondary">
            Constory transforms information about your brand into a real content strategy, organized ideas, and a
            fully-detailed content calendar — one connected workspace, not three disconnected tools.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/signup">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
        </section>

        {/* Product workflow */}
        <section id="how-it-works" className="border-y border-border bg-surface py-16">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <h2 className="text-center text-2xl font-semibold text-text-primary">How Constory works</h2>
            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-text-secondary">
              One connected workflow — from understanding your brand to telling a better story.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
              {WORKFLOW.map((step, i) => (
                <div key={step} className="flex items-center gap-2">
                  <span className="rounded-full border border-border bg-app-background px-4 py-2 text-sm font-medium text-text-primary">
                    {step}
                  </span>
                  {i < WORKFLOW.length - 1 && <ArrowRight className="h-4 w-4 text-text-muted" aria-hidden="true" />}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Key features */}
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="text-center text-2xl font-semibold text-text-primary">Everything you need to plan content that works</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border border-border bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-light text-constory-blue">
                  <f.icon className="h-5 w-5" aria-hidden="true" />
                </div>
                <h3 className="mt-4 font-semibold text-text-primary">{f.title}</h3>
                <p className="mt-1.5 text-sm text-text-secondary">{f.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-constory-black py-16">
          <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-white">Ready to plan with purpose?</h2>
            <p className="mt-2 text-sm text-white/70">Set up your brand and get your first content strategy in minutes.</p>
            <Button asChild size="lg" className="mt-6">
              <Link href="/signup">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-surface py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-text-secondary sm:flex-row sm:px-6">
          <span>© {new Date().getFullYear()} Constory. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-text-primary">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-text-primary">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-text-primary">
              Sign up
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
