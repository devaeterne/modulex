import type { Metadata } from "next";
import Link from "next/link";
import Hero, { type HomeHeroContent } from "@/components/Home/Hero";
import VirtualTour from "@/components/Home/VirtualTour";
import ProductCard from "@/components/products/ProductCard";
import { getStorePublicCompanyProfile } from "@/lib/store/company/queries";
import { getStoreCatalogProducts } from "@/lib/store/products/queries";
import { getStoreHomeFeatures, getStoreSiteSettings, type StoreSiteSettings } from "@/lib/store/site/queries";

export const revalidate = 300;

const FALLBACK_SETTINGS: StoreSiteSettings = {
  homepageEyebrow: "Oakwell Cabinetry",
  homepageTitle: "Cabinetry Built for Everyday Living",
  homepageHighlight: "Designed to Perform",
  homepageSubtitle: "Explore cabinet product families, finish options, and resources from Oakwell Cabinetry.",
  heroPrimaryLabel: "View Products",
  heroPrimaryHref: "/products",
  heroSecondaryLabel: "Contact Us",
  heroSecondaryHref: "/contact",
  heroPosterUrl: "/assets/images/img(3).jpg",
  heroPanoramaUrl: "/assets/images/panorama/image2.jpg",
  heroPanoramaEnabled: true,
  showFeatures: true,
  showFeaturedProducts: true,
  showVirtualTour: false,
  showDealerCta: true,
  featuredProductsEyebrow: "Oakwell Cabinetry",
  featuredProductsTitle: "Featured Products",
  featuredProductsDescription: "Explore selected cabinet product families and available finish variants.",
  dealerCtaTitle: "Interested in becoming an Oakwell dealer?",
  dealerCtaDescription: "Connect with Oakwell Cabinetry to learn more about dealer opportunities and product support.",
  dealerCtaLabel: "Apply to Become a Dealer",
  dealerCtaHref: "/dealers/apply",
  footerDescription: "Cabinet products, finish options, resources, and dealer support from Oakwell Cabinetry.",
  facebookUrl: null,
  instagramUrl: null,
  linkedinUrl: null,
  pinterestUrl: null,
  tiktokUrl: null,
  youtubeUrl: null,
  homepageSeoTitle: "Oakwell Cabinetry | Cabinet Products & Dealer Support",
  homepageSeoDescription: "Explore Oakwell Cabinetry products, finish options, resources, and dealer information.",
  homepageOgImageUrl: null,
  updatedAt: null,
};

async function loadSiteSettings() {
  try {
    return (await getStoreSiteSettings()) ?? FALLBACK_SETTINGS;
  } catch (error) {
    console.error("Unable to load Store site settings", error);
    return FALLBACK_SETTINGS;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSiteSettings();
  const title = settings.homepageSeoTitle || "Oakwell Cabinetry";
  const description = settings.homepageSeoDescription || FALLBACK_SETTINGS.homepageSeoDescription || undefined;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: {
      title,
      description,
      url: "/",
      images: settings.homepageOgImageUrl ? [{ url: settings.homepageOgImageUrl }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: settings.homepageOgImageUrl ? [settings.homepageOgImageUrl] : undefined,
    },
  };
}

export default async function Home() {
  const settings = await loadSiteSettings();
  const [companyResult, featuresResult, productResult] = await Promise.allSettled([
    getStorePublicCompanyProfile(),
    settings.showFeatures ? getStoreHomeFeatures() : Promise.resolve([]),
    settings.showFeaturedProducts ? getStoreCatalogProducts({ limit: 12 }) : Promise.resolve([]),
  ]);

  const company = companyResult.status === "fulfilled" ? companyResult.value : null;
  const features = featuresResult.status === "fulfilled" ? featuresResult.value : [];
  const featuredProducts = productResult.status === "fulfilled"
    ? productResult.value.filter((product) => product.isFeatured).slice(0, 6)
    : [];

  const heroContent: HomeHeroContent = {
    eyebrow: settings.homepageEyebrow || company?.companyName || "Oakwell Cabinetry",
    title: settings.homepageTitle,
    highlight: settings.homepageHighlight,
    subtitle: settings.homepageSubtitle,
    primaryLabel: settings.heroPrimaryLabel,
    primaryHref: settings.heroPrimaryHref,
    secondaryLabel: settings.heroSecondaryLabel,
    secondaryHref: settings.heroSecondaryHref,
    posterUrl: settings.heroPosterUrl || FALLBACK_SETTINGS.heroPosterUrl || "/assets/images/img(3).jpg",
    panoramaUrl: settings.heroPanoramaUrl,
    panoramaEnabled: settings.heroPanoramaEnabled,
  };

  return (
    <>
      <Hero content={heroContent} />

      {settings.showFeatures && features.length > 0 ? (
        <section className="services" aria-labelledby="why-oakwell-heading">
          <div className="container">
            <div className="section-header text-center">
              <span className="section-tag">Oakwell Cabinetry</span>
              <h2 id="why-oakwell-heading">Why Oakwell</h2>
              <p>Explore product information and support built around the Oakwell cabinet catalog.</p>
            </div>
            <div className="services-grid">
              {features.map((feature) => (
                <article className="service-card" key={feature.id}>
                  <div className="service-icon" aria-hidden="true"><i className="bi bi-grid"></i></div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                  {feature.linkLabel && feature.linkHref ? (
                    <Link href={feature.linkHref} className="service-link">
                      {feature.linkLabel} <i className="bi bi-chevron-right" aria-hidden="true"></i>
                    </Link>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {settings.showFeaturedProducts && featuredProducts.length > 0 ? (
        <section className="shop-section pb-5" aria-labelledby="featured-products-heading">
          <div className="container">
            <div className="section-header text-center">
              {settings.featuredProductsEyebrow ? <span className="section-tag">{settings.featuredProductsEyebrow}</span> : null}
              <h2 id="featured-products-heading">{settings.featuredProductsTitle || "Featured Products"}</h2>
              {settings.featuredProductsDescription ? <p>{settings.featuredProductsDescription}</p> : null}
            </div>
            <div className="row g-4">
              {featuredProducts.map((product) => (
                <div className="col-xl-4 col-md-6" key={product.id}>
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
            <div className="mt-5 text-center">
              <Link href="/products" className="btn-primary">View All Products</Link>
            </div>
          </div>
        </section>
      ) : null}

      {settings.showVirtualTour ? <VirtualTour /> : null}

      {settings.showDealerCta && settings.dealerCtaTitle ? (
        <section className="cta-section">
          <div className="cta-content">
            <h2>{settings.dealerCtaTitle}</h2>
            {settings.dealerCtaDescription ? <p>{settings.dealerCtaDescription}</p> : null}
            {settings.dealerCtaLabel && settings.dealerCtaHref ? (
              <div className="cta-buttons">
                <Link href={settings.dealerCtaHref} className="btn-white">{settings.dealerCtaLabel}</Link>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </>
  );
}
