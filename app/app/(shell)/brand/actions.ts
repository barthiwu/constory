"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  upsertBrandProfile,
  createProductService,
  updateProductService,
  deleteProductService,
  type UpsertBrandProfileInput,
  type ProductServiceInput,
} from "@/services/brand-service";
import type { ProductService } from "@/types/database";

export interface ActionResult {
  error?: string;
}

export async function updateBrandSectionAction(
  workspaceId: string,
  input: UpsertBrandProfileInput,
): Promise<ActionResult> {
  const supabase = await createClient();
  try {
    await upsertBrandProfile(supabase, workspaceId, input);
    revalidatePath("/app/brand");
    revalidatePath("/app/dashboard");
    return {};
  } catch {
    return { error: "We couldn't save your changes. Please try again." };
  }
}

export async function createProductAction(
  workspaceId: string,
  input: ProductServiceInput,
): Promise<{ product: ProductService } | { error: string }> {
  const supabase = await createClient();
  try {
    const product = await createProductService(supabase, workspaceId, input);
    revalidatePath("/app/brand");
    return { product };
  } catch {
    return { error: "We couldn't add that product. Please try again." };
  }
}

export async function updateProductAction(
  id: string,
  input: Partial<ProductServiceInput>,
): Promise<{ product: ProductService } | { error: string }> {
  const supabase = await createClient();
  try {
    const product = await updateProductService(supabase, id, input);
    revalidatePath("/app/brand");
    return { product };
  } catch {
    return { error: "We couldn't save that product. Please try again." };
  }
}

export async function deleteProductAction(id: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient();
  try {
    await deleteProductService(supabase, id);
    revalidatePath("/app/brand");
    return { ok: true };
  } catch {
    return { error: "We couldn't remove that product. Please try again." };
  }
}
