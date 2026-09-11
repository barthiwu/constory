import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SettingsNav } from "@/components/layout/settings-nav";
import { SecurityView } from "@/components/security/security-view";
import { listMfaFactorsAction } from "./actions";

export const metadata: Metadata = { title: "Security — Constory" };

export default async function SecuritySettingsPage() {
  const factors = await listMfaFactorsAction();

  return (
    <div className="grid gap-6">
      <PageHeader title="Settings" description="Manage your profile, workspace, and account." />
      <SettingsNav />
      <SecurityView factors={factors} />
    </div>
  );
}
