export type StoreProductVariant = {
  id: string;
  sku: string;
  colorCode: string;
  colorName: string;
};

export type StoreCatalogProduct = {
  id: string;
  baseProductCode: string;
  slug: string;
  displayName: string;
  shortDescription: string | null;
  category: string | null;
  brand: string | null;
  isFeatured: boolean;
  sortOrder: number;
  primaryImageUrl: string | null;
  variants: StoreProductVariant[];
  updatedAt: string;
};

export type StoreProductMedia = {
  id: string;
  type: "image" | "document" | "video";
  url: string;
  altText: string | null;
  title: string | null;
  colorCode: string | null;
  isPrimary: boolean;
};

export type StoreProductDetail = {
  id: string;
  baseProductCode: string;
  slug: string;
  displayName: string;
  shortDescription: string | null;
  description: string | null;
  category: string | null;
  brand: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogImageUrl: string | null;
  media: StoreProductMedia[];
  variants: StoreProductVariant[];
  updatedAt: string;
};

export type StoreCatalogQuery = {
  query?: string;
  colorCode?: string;
  limit?: number;
  offset?: number;
};
