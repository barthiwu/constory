import Link from "next/link";

// Mirrors app/(auth)/layout.tsx's centered-card look — this route isn't
// inside the (auth) group (it must stay reachable logged-out AND logged-in,
// see app/invite/[token]/page.tsx), so it gets its own copy of the same
// wrapper rather than sharing that group's layout.
export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app-background px-4 py-12">
      <Link href="/" className="mb-8 text-[29px] font-semibold tracking-tight text-constory-blue">
        Constory
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
