import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-app-background px-4 py-12">
      <Link href="/" className="mb-8 text-[29px] font-semibold tracking-tight text-constory-blue">
        Constory
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
