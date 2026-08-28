import { cache } from "react";
import { callPublicRpc } from "@/lib/supabase/public-rest";

export type StoreSiteSettings = {
  homepageEyebrow: string | null;
  homepageTitle: string;
  homepageHighlight: string | null;
  homepageSubtitle: string | null;
  heroPrimaryLabel: string | null;
  heroPrimaryHref: string | null;
  heroSecondaryLabel: string | null;
  heroSecondaryHref: string | null;
  heroPosterUrl: string | null;
  heroPanoramaUrl: string | null;
  heroPanoramaEnabled: boolean;
  showFeatures: boolean;
  showFeaturedProducts: boolean;
  showVirtualTour: boolean;
  showDealerCta: boolean;
  featuredProductsEyebrow: string | null;
  featuredProductsTitle: string | null;
  featuredProductsDescription: string | null;
  dealerCtaTitle: string | null;
  dealerCtaDescription: string | null;
  dealerCtaLabel: string | null;
  dealerCtaHref: string | null;
  footerDescription: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  linkedinUrl: string | null;
  pinterestUrl: string | null;
  tiktokUrl: string | null;
  youtubeUrl: string | null;
  homepageSeoTitle: string | null;
  homepageSeoDescription: string | null;
  homepageOgImageUrl: string | null;
  updatedAt: string | null;
};

export type StoreHomeFeature = {
  id: string;
  title: string;
  description: string;
  linkLabel: string | null;
  linkHref: string | null;
  sortOrder: number;
};

type SiteSettingsRpc = {
  homepage_eyebrow: string | null;
  homepage_title: string;
  homepage_highlight: string | null;
  homepage_subtitle: string | null;
  hero_primary_label: string | null;
  hero_primary_href: string | null;
  hero_secondary_label: string | null;
  hero_secondary_href: string | null;
  hero_poster_url: string | null;
  hero_panorama_url: string | null;
  hero_panorama_enabled: boolean;
  show_features: boolean;
  show_featured_products: boolean;
  show_virtual_tour: boolean;
  show_dealer_cta: boolean;
  featured_products_eyebrow: string | null;
  featured_products_title: string | null;
  featured_products_description: string | null;
  dealer_cta_title: string | null;
  dealer_cta_description: string | null;
  dealer_cta_label: string | null;
  dealer_cta_href: string | null;
  footer_description: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  pinterest_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  homepage_seo_title: string | null;
  homepage_seo_description: string | null;
  homepage_og_image_url: string | null;
  updated_at: string | null;
};

function mapSiteSettings(row: SiteSettingsRpc): StoreSiteSettings {
  return {
    homepageEyebrow: row.homepage_eyebrow,
    homepageTitle: row.homepage_title,
    homepageHighlight: row.homepage_highlight,
    homepageSubtitle: row.homepage_subtitle,
    heroPrimaryLabel: row.hero_primary_label,
    heroPrimaryHref: row.hero_primary_href,
    heroSecondaryLabel: row.hero_secondary_label,
    heroSecondaryHref: row.hero_secondary_href,
    heroPosterUrl: row.hero_poster_url,
    heroPanoramaUrl: row.hero_panorama_url,
    heroPanoramaEnabled: row.hero_panorama_enabled,
    showFeatures: row.show_features,
    showFeaturedProducts: row.show_featured_products,
    showVirtualTour: row.show_virtual_tour,
    showDealerCta: row.show_dealer_cta,
    featuredProductsEyebrow: row.featured_products_eyebrow,
    featuredProductsTitle: row.featured_products_title,
    featuredProductsDescription: row.featured_products_description,
    dealerCtaTitle: row.dealer_cta_title,
    dealerCtaDescription: row.dealer_cta_description,
    dealerCtaLabel: row.dealer_cta_label,
    dealerCtaHref: row.dealer_cta_href,
    footerDescription: row.footer_description,
    facebookUrl: row.facebook_url,
    instagramUrl: row.instagram_url,
    linkedinUrl: row.linkedin_url,
    pinterestUrl: row.pinterest_url,
    tiktokUrl: row.tiktok_url,
    youtubeUrl: row.youtube_url,
    homepageSeoTitle: row.homepage_seo_title,
    homepageSeoDescription: row.homepage_seo_description,
    homepageOgImageUrl: row.homepage_og_image_url,
    updatedAt: row.updated_at,
  };
}

export const getStoreSiteSettings = cache(async (): Promise<StoreSiteSettings | null> => {
  const row = await callPublicRpc<SiteSettingsRpc | null>(
    "get_store_site_settings",
    {},
    { revalidate: 300 }
  );

  return row ? mapSiteSettings(row) : null;
});

export const getStoreHomeFeatures = cache(async (): Promise<StoreHomeFeature[]> => {
  return callPublicRpc<StoreHomeFeature[]>(
    "get_store_home_features",
    {},
    { revalidate: 300 }
  );
});
