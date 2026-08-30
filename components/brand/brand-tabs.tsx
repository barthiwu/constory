"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import type { BrandProfile, ProductService } from "@/types/database";
import { BusinessSection } from "@/components/brand/business-section";
import { ProductsSection } from "@/components/brand/products-section";
import { AudienceSection } from "@/components/brand/audience-section";
import { GoalsSection } from "@/components/brand/goals-section";
import { VoiceSection } from "@/components/brand/voice-section";
import { PlatformsSection } from "@/components/brand/platforms-section";

export function BrandTabs({
  workspaceId,
  brandProfile,
  products,
}: {
  workspaceId: string;
  brandProfile: BrandProfile | null;
  products: ProductService[];
}) {
  const [tab, setTab] = useState("business");

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="flex-wrap h-auto">
        <TabsTrigger value="business">Business</TabsTrigger>
        <TabsTrigger value="products">Products & Services</TabsTrigger>
        <TabsTrigger value="audience">Audience</TabsTrigger>
        <TabsTrigger value="goals">Goals</TabsTrigger>
        <TabsTrigger value="voice">Brand Voice</TabsTrigger>
        <TabsTrigger value="platforms">Platforms</TabsTrigger>
      </TabsList>

      <TabsContent value="business">
        <BusinessSection workspaceId={workspaceId} brandProfile={brandProfile} />
      </TabsContent>
      <TabsContent value="products">
        <ProductsSection workspaceId={workspaceId} products={products} />
      </TabsContent>
      <TabsContent value="audience">
        <AudienceSection workspaceId={workspaceId} brandProfile={brandProfile} />
      </TabsContent>
      <TabsContent value="goals">
        <GoalsSection workspaceId={workspaceId} brandProfile={brandProfile} />
      </TabsContent>
      <TabsContent value="voice">
        <VoiceSection workspaceId={workspaceId} brandProfile={brandProfile} />
      </TabsContent>
      <TabsContent value="platforms">
        <PlatformsSection workspaceId={workspaceId} brandProfile={brandProfile} />
      </TabsContent>
    </Tabs>
  );
}
