import type { Metadata } from "next";
import Link from "next/link";
import JsonLd from "@/components/seo/JsonLd";
import StoreIcon from "@/components/StoreIcon";
import {
  getStorePublicCompanyLocations,
  getStorePublicCompanyProfile,
  type StorePublicCompanyLocation,
  type StorePublicCompanyProfile,
} from "@/lib/store/company/queries";
import { getStorePublicPage, type StorePublicPage } from "@/lib/store/content/queries";
import { resolveManagedSeoTitle } from "@/lib/seo/metadata";
import {
  createBreadcrumbJsonLd,
  createLocalBusinessJsonLd,
} from "@/lib/seo/structured-data";

export const revalidate = 60;

const FALLBACK_TITLE = "Oakwell Cabinetry Showroom Information";
const FALLBACK_DESCRIPTION =
  "Find current Oakwell Cabinetry showroom information, published locations, business hours, and contact details.";

const FALLBACK_METADATA: Metadata = {
  title: FALLBACK_TITLE,
  description: FALLBACK_DESCRIPTION,
  alternates: { canonical: "/showroom" },
  robots: { index: false, follow: true },
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

function addressLines(location: StorePublicCompanyLocation) {
  return [
    location.addressLine1,
    location.addressLine2,
    [location.city, location.stateRegion, location.postalCode].filter(Boolean).join(", "),
    location.countryCode,
  ].filter((line): line is string => Boolean(line));
}

function displayTime(value: string | null) {
  return value?.slice(0, 5) ?? "";
}

function PageCta({ page }: { page: StorePublicPage }) {
  if (!page.ctaLabel || !page.ctaHref) return null;

  if (page.ctaHref.startsWith("/")) {
    return (
      <Link href={page.ctaHref} className="btn-primary">
        {page.ctaLabel}
      </Link>
    );
  }

  return (
    <a href={page.ctaHref} className="btn-primary" target="_blank" rel="noopener noreferrer">
      {page.ctaLabel}
    </a>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [page, structure] = await Promise.all([
      getStorePublicPage("showroom"),
      getStorePublicCompanyLocations(),
    ]);
    const showrooms = structure.locations.filter((location) => location.locationType === "showroom");
    const hasPublishedShowroom = showrooms.length > 0;

    if (!page) {
      return {
        ...FALLBACK_METADATA,
        robots: { index: hasPublishedShowroom, follow: true },
      };
    }

    const title = resolveManagedSeoTitle(page.seoTitle, page.title);
    const openGraphTitle = page.seoTitle?.trim() || page.title;
    const description = page.seoDescription || page.intro || FALLBACK_DESCRIPTION;
    const image = page.ogImageUrl || page.heroImageUrl;

    return {
      title,
      description,
      alternates: { canonical: "/showroom" },
      robots: { index: hasPublishedShowroom, follow: true },
      openGraph: {
        title: openGraphTitle,
        description,
        url: "/showroom",
        ...(image ? { images: [image] } : {}),
      },
    };
  } catch {
    return FALLBACK_METADATA;
  }
}

export default async function ShowroomPage() {
  const [locationsResult, pageResult, companyResult] = await Promise.allSettled([
    getStorePublicCompanyLocations(),
    getStorePublicPage("showroom"),
    getStorePublicCompanyProfile(),
  ]);

  const structure = locationsResult.status === "fulfilled"
    ? locationsResult.value
    : { locations: [], contactChannels: [] };
  const page = pageResult.status === "fulfilled" ? pageResult.value : null;
  const company: StorePublicCompanyProfile | null =
    companyResult.status === "fulfilled" ? companyResult.value : null;

  if (locationsResult.status === "rejected") {
    console.error("Unable to load public showroom locations");
  }
  if (pageResult.status === "rejected") {
    console.error("Unable to load published Showroom CMS content");
  }
  if (companyResult.status === "rejected") {
    console.error("Unable to load public company profile for Showroom structured data");
  }

  const showrooms = structure.locations.filter((location) => location.locationType === "showroom");
  const pageTitle = page ? page.title : FALLBACK_TITLE;
  const breadcrumbJsonLd = createBreadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Showroom", path: "/showroom" },
  ]);
  const localBusinessJsonLd = showrooms.map((location) => createLocalBusinessJsonLd(location, company));

  return (
    <>
      <JsonLd data={[breadcrumbJsonLd, ...localBusinessJsonLd]} />

      <section className="page-header">
        {page?.heroImageUrl ? (
          <div
            className="header-bg-image"
            role={page.heroImageAlt ? "img" : undefined}
            aria-label={page.heroImageAlt || undefined}
            style={{ backgroundImage: `url('${page.heroImageUrl}')` }}
          />
        ) : null}
        <div className="header-overlay" />
        <div className="container">
          <div className="row">
            <div className="header-content">
              <div className="bread-title"><h1>{pageTitle}</h1></div>
              <nav className="breadcrumb" aria-label="Breadcrumb">
                <Link href="/">Home</Link>
                <span className="separator">/</span>
                <span className="current">Showroom</span>
              </nav>
            </div>
          </div>
        </div>
      </section>

      <section className="process-section" aria-labelledby="showroom-heading">
        <div className="container py-5">
          <div className="section-header text-center">
            {page ? <span className="section-tag">{page.eyebrow || "Oakwell Cabinetry"}</span> : <span className="section-tag">Oakwell Cabinetry</span>}
            <h2 id="showroom-heading">{pageTitle}</h2>
            {page ? (
              <>
                {page.intro ? <p>{page.intro}</p> : null}
                {page.body ? <p style={{ whiteSpace: "pre-line" }}>{page.body}</p> : null}
                {page.ctaLabel && page.ctaHref ? (
                  <div className="cta-buttons justify-content-center mt-4">
                    <PageCta page={page} />
                  </div>
                ) : null}
              </>
            ) : (
              <p>Only active showroom locations and verified business hours are published here.</p>
            )}
          </div>

          {showrooms.length === 0 ? (
            <div className="row justify-content-center">
              <div className="col-lg-8">
                <div className="service-card text-center">
                  <h3>No showroom locations are currently published.</h3>
                  <p>Contact our team before planning a visit or for current product-support options.</p>
                  <Link href="/contact" className="btn-primary">Contact Oakwell Cabinetry</Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="row g-4 justify-content-center">
              {showrooms.map((location) => {
                const lines = addressLines(location);
                const mapHref = /^https?:\/\//i.test(location.mapUrl?.trim() ?? "") ? location.mapUrl!.trim() : null;

                return (
                  <div className="col-lg-6" key={location.id}>
                    <article className="service-card h-100">
                      <div className="service-icon" aria-hidden="true"><StoreIcon name="building" /></div>
                      <h3>{location.name}</h3>
                      {lines.length > 0 ? (
                        <address>{lines.map((line) => <span className="d-block" key={line}>{line}</span>)}</address>
                      ) : null}
                      {location.email ? <p><strong>Email:</strong> <a href={`mailto:${location.email}`}>{location.email}</a></p> : null}
                      {location.phone ? <p><strong>Phone:</strong> <a href={phoneHref(location.phone)}>{location.phone}</a></p> : null}
                      {mapHref ? <p><a href={mapHref} target="_blank" rel="noopener noreferrer">View map</a></p> : null}
                      {location.hours.length > 0 ? (
                        <div className="mt-4">
                          <h4>Business Hours</h4>
                          <dl className="mb-0">
                            {location.hours.map((hour) => (
                              <div className="d-flex justify-content-between gap-3" key={`${location.id}-${hour.dayOfWeek}`}>
                                <dt>{DAYS[hour.dayOfWeek] ?? `Day ${hour.dayOfWeek}`}</dt>
                                <dd className="mb-1 text-end">
                                  {hour.isClosed ? "Closed" : `${displayTime(hour.opensAt)}–${displayTime(hour.closesAt)}`}
                                  {hour.note ? <span className="d-block">{hour.note}</span> : null}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ) : null}
                    </article>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
