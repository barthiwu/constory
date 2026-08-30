import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/services/workspace-service";
import { getBrandProfile, getProductsServices } from "@/services/brand-service";
import { PageHeader } from "@/components/layout/page-header";
import { BrandTabs } from "@/components/brand/brand-tabs";

export const metadata: Metadata = { title: "Brand — Constory" };

export default async function BrandPage() {
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase);
  if (!workspace) return null;

  const [brandProfile, products] = await Promise.all([
    getBrandProfile(supabase, workspace.id),
    getProductsServices(supabase, workspace.id),
  ]);

  return (
    <div className="grid gap-6">
      <PageHeader title="Brand" description="Everything Constory uses to understand your brand and plan content." />
      <BrandTabs workspaceId={workspace.id} brandProfile={brandProfile} products={products} />
    </div>
  );
}
