import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, BrandProfile, ProductService } from "@/types/database";

type DB = SupabaseClient<Database>;

export async function getBrandProfile(supabase: DB, workspaceId: string): Promise<BrandProfile | null> {
  const { data, error } = await supabase.from("brand_profiles").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error;
  return data as BrandProfile | null;
}

export interface UpsertBrandProfileInput {
  business_description?: string;
  target_audience?: string;
  audience_type?: string | null;
  audience_locations?: string | null;
  audience_age_range?: string | null;
  audience_interests?: string | null;
  audience_problems?: string | null;
  brand_voice?: string;
  primary_goal?: string | null;
  secondary_goals?: string[];
  selected_platforms?: string[];
}

export async function upsertBrandProfile(
  supabase: DB,
  workspaceId: string,
  input: UpsertBrandProfileInput,
): Promise<BrandProfile> {
  const existing = await getBrandProfile(supabase, workspaceId);

  if (existing) {
    const { data, error } = await supabase
      .from("brand_profiles")
      .update(input)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw error;
    return data as BrandProfile;
  }

  const { data, error } = await supabase
    .from("brand_profiles")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single();
  if (error) throw error;
  return data as BrandProfile;
}

export async function getProductsServices(supabase: DB, workspaceId: string): Promise<ProductService[]> {
  const { data, error } = await supabase
    .from("products_services")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface ProductServiceInput {
  name: string;
  description?: string;
  category?: string | null;
}

export async function createProductService(
  supabase: DB,
  workspaceId: string,
  input: ProductServiceInput,
): Promise<ProductService> {
  const { data, error } = await supabase
    .from("products_services")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProductService(
  supabase: DB,
  id: string,
  input: Partial<ProductServiceInput>,
): Promise<ProductService> {
  const { data, error } = await supabase.from("products_services").update(input).eq("id", id).select("*").single();
  if (error) throw error;
  return data;
}

export async function deleteProductService(supabase: DB, id: string): Promise<void> {
  const { error } = await supabase.from("products_services").delete().eq("id", id);
  if (error) throw error;
}
