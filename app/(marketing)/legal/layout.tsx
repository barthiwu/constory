import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/legal/terms", label: "Terms of Service" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/refund", label: "Refund Policy" },
];

/**
 * Shared shell for the legal pages. Deliberately plain (no marketing chrome)
 * so these read as reference documents, with a small cross-nav between the
 * three so a visitor who lands on one can find the others.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="text-[22px] font-semibold tracking-tight text-constory-blue">
            Constory
          </Link>
          <Link href="/" className="text-sm text-text-secondary hover:text-text-primary">
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6">
        <nav className="mb-8 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-constory-blue hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <article className="prose-legal">{children}</article>
      </main>

      <footer className="border-t border-border bg-surface py-6">
        <div className="mx-auto max-w-3xl px-4 text-sm text-text-secondary sm:px-6">
          © {new Date().getFullYear()} Constory. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
