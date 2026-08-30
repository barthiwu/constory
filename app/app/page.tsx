import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";

export default async function AppIndexPage() {
  const supabase = await createClient();
  const active = await getCurrentWorkspace(supabase);
  redirect(active ? "/app/dashboard" : "/app/onboarding");
}
