import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-background px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-light">
        <Compass className="h-6 w-6 text-constory-blue" aria-hidden="true" />
      </div>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold text-text-primary">Page not found</h1>
        <p className="max-w-sm text-sm text-text-secondary">The page you&apos;re looking for doesn&apos;t exist or may have moved.</p>
      </div>
      <Button asChild>
        <Link href="/app/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}
