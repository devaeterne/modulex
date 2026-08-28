import { callPublicRpc } from "@/lib/supabase/public-rest";
import type {
  StoreCatalogProduct,
  StoreCatalogQuery,
  StoreProductDetail,
  StoreProductVariant,
} from "./types";

type CatalogRpcRow = {
  id: string;
  base_product_code: string;
  slug: string;
  display_name: string;
  short_description: string | null;
  category: string | null;
  brand: string | null;
  is_featured: boolean;
  sort_order: number;
  primary_image_url: string | null;
  variants: StoreProductVariant[] | null;
  updated_at: string;
};

function mapCatalogRow(row: CatalogRpcRow): StoreCatalogProduct {
  return {
    id: row.id,
    baseProductCode: row.base_product_code,
    slug: row.slug,
    displayName: row.display_name,
    shortDescription: row.short_description,
    category: row.category,
    brand: row.brand,
    isFeatured: row.is_featured,
    sortOrder: row.sort_order,
    primaryImageUrl: row.primary_image_url,
    variants: row.variants ?? [],
    updatedAt: row.updated_at,
  };
}

export async function getStoreCatalogProducts(
  params: StoreCatalogQuery = {}
): Promise<StoreCatalogProduct[]> {
  const rows = await callPublicRpc<CatalogRpcRow[]>(
    "get_store_catalog_products",
    {
      p_query: params.query?.trim() || null,
      p_color_code: params.colorCode?.trim() || null,
      p_limit: params.limit ?? 48,
      p_offset: params.offset ?? 0,
    }
  );

  return rows.map(mapCatalogRow);
}

export async function getStoreProductBySlug(
  slug: string
): Promise<StoreProductDetail | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedSlug)) {
    return null;
  }

  return callPublicRpc<StoreProductDetail | null>("get_store_product_by_slug", {
    p_slug: normalizedSlug,
  });
}
