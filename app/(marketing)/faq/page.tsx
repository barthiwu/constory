import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { FAQ_ITEMS } from "@/lib/support/faq";

export const metadata: Metadata = {
  title: "FAQ — Constory",
  description: "Answers to common questions about how Constory works, AI credits, billing, and your account.",
};

// Public route, same shell pattern as app/(marketing)/pricing/page.tsx. The
// floating support widget (mounted globally in app/layout.tsx) sits on this
// page too, for anything not covered below.
export default async function FaqPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const categories = Array.from(new Set(FAQ_ITEMS.map((item) => item.category)));

  return (
    <div className="flex min-h-screen flex-col bg-app-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-[22px] font-semibold tracking-tight text-constory-blue">
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
                  <Link href="/signup">Get started</Link>
                </Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">Frequently asked questions</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Can&apos;t find what you&apos;re looking for? Use the chat button in the corner of any page — it&apos;s happy to help,
          and can connect you with us directly if it can&apos;t.
        </p>

        <div className="mt-8 space-y-8">
          {categories.map((category) => (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">{category}</h2>
              <div className="grid gap-3">
                {FAQ_ITEMS.filter((item) => item.category === category).map((item) => (
                  <details key={item.question} className="group rounded-lg border border-border bg-surface p-4 open:pb-4">
                    <summary className="cursor-pointer list-none text-sm font-medium text-text-primary marker:content-none">
                      <span className="flex items-center justify-between gap-4">
                        {item.question}
                        <span
                          className="shrink-0 text-text-muted transition-transform group-open:rotate-45"
                          aria-hidden="true"
                        >
                          +
                        </span>
                      </span>
                    </summary>
                    <p className="mt-2 text-sm text-text-secondary">{item.answer}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>

      <footer className="border-t border-border bg-surface py-6">
        <div className="mx-auto max-w-3xl px-4 text-sm text-text-secondary sm:px-6">
          © {new Date().getFullYear()} Constory. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
