import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen bg-app-background">
      <div className="border-b border-border bg-surface px-4 py-4 sm:px-8">
        <span className="text-lg font-semibold tracking-tight text-constory-black">Constory</span>
      </div>
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">{children}</div>
    </div>
  );
}
